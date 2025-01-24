import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react"
import { Streamlit, withStreamlitConnection, ComponentProps } from "streamlit-component-lib"
import { Span, RendererOptions } from "./types"

/** We'll add a unique span_id to each span for reliable identification. */
interface EditableSpan extends Span {
    span_id: number
    editing?: boolean
    tempLabel?: string
}

/** Render-time metadata for each token. */
interface TokenEntity {
    label: string
    span_id: number
    is_start: boolean
    render_slot: number
}

interface TokenMarkup {
    text: string
    idx: number
    entities: TokenEntity[]
}

/** Sort spans, assign render_slot, and produce token-level info for rendering. */
function assemblePerTokenInfo(tokens: string[], spans: EditableSpan[]): TokenMarkup[] {
    spans.sort((a, b) => {
        const lenA = a.end_token - a.start_token
        const lenB = b.end_token - b.start_token
        const startDiff = a.start_token - b.start_token
        if (startDiff !== 0) return startDiff
        if (lenB !== lenA) return lenB - lenA
        return a.label.localeCompare(b.label)
    })
    // Reset each span's render slot
    spans.forEach(s => (s.render_slot = 0))

    const perTokenInfo: TokenMarkup[] = []
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i]
        const intersectingSpans: EditableSpan[] = []
        const entities: TokenEntity[] = []

        spans.forEach(span => {
            if (span.start_token <= i && i < span.end_token) {
                const isStart = i === span.start_token
                if (isStart) {
                    span.render_slot =
                        (intersectingSpans[intersectingSpans.length - 1]?.render_slot ?? 0) + 1
                }
                intersectingSpans.push(span)
                entities.push({
                    label: span.label,
                    span_id: span.span_id,
                    is_start: isStart,
                    render_slot: span.render_slot ?? 0,
                })
            } else {
                span.render_slot = 0
            }
        })

        perTokenInfo.push({ text: token, idx: i, entities })
    }
    return perTokenInfo
}

/** We'll maintain a global counter to assign unique IDs to new spans. */
let globalSpanCounter = 1

function MySpanComponent({ args }: ComponentProps) {
    const tokens: string[] = args["tokens"] ?? []
    const rawSpans: Span[] = args["spans"] ?? []
    const options: RendererOptions = args["options"] ?? {}
    const { top_offset = 40, span_label_offset = 20, top_offset_step = 17, colors = {} } = options

    // Default colors for known labels
    const defaultColors: Record<string, string> = {
        ORG: "#7aecec", PRODUCT: "#bfeeb7", GPE: "#feca74", LOC: "#ff9561", PERSON: "#aa9cfc",
        NORP: "#c887fb", FAC: "#9cc9cc", EVENT: "#ffeb80", LAW: "#ff8197", LANGUAGE: "#ff8197",
        WORK_OF_ART: "#f0d0ff", DATE: "#bfe1d9", TIME: "#bfe1d9", MONEY: "#e4e7d2", QUANTITY: "#e4e7d2",
        ORDINAL: "#e4e7d2", CARDINAL: "#e4e7d2", PERCENT: "#e4e7d2",
    }
    const mergedColors = { ...defaultColors, ...colors }
    const defaultColor = "#ddd"

    /** Convert incoming spans to our local EditableSpan format. */
    const toEditableSpans = useCallback(
        (arr: Span[]): EditableSpan[] =>
            arr.map(s => ({
                ...s,
                span_id: globalSpanCounter++,
                editing: false,
                tempLabel: s.label,
            })),
        []
    )

    /** Local state of spans. */
    const [componentSpans, setComponentSpans] = useState<EditableSpan[]>(() =>
        toEditableSpans(rawSpans)
    )

    /** Return updated spans (minus local fields) to Streamlit whenever changed. */
    useEffect(() => {
        const plainSpans = componentSpans.map(({ span_id, editing, tempLabel, ...rest }) => rest)
        Streamlit.setComponentValue(plainSpans)
    }, [componentSpans])

    const containerRef = useRef<HTMLDivElement>(null)

    /** Recompute token info each time spans/tokens change. */
    const perTokenInfo = useMemo(
        () => assemblePerTokenInfo(tokens, componentSpans),
        [tokens, componentSpans]
    )

    /** Update frame height for Streamlit on each render. */
    useEffect(() => {
        Streamlit.setFrameHeight()
    }, [perTokenInfo])

    /** Possible labels for new/edit spans from mergedColors. */
    const labelOptions = useMemo(() => Object.keys(mergedColors).sort(), [mergedColors])

    const getColor = (label: string) => mergedColors[label.toUpperCase()] || defaultColor

    /** Remove a span by ID. */
    const handleRemoveSpan = (span_id: number) => {
        setComponentSpans(prev => prev.filter(s => s.span_id !== span_id))
    }

    /** Toggle editing on/off. Reset tempLabel if toggling off. */
    const handleEditToggle = (span_id: number) => {
        setComponentSpans(prev =>
            prev.map(s => {
                if (s.span_id === span_id) {
                    return { ...s, editing: !s.editing, tempLabel: s.editing ? s.label : s.tempLabel }
                }
                return s
            })
        )
    }

    /** Update span label while editing. */
    const handleLabelChange = (span_id: number, newLabel: string) => {
        setComponentSpans(prev =>
            prev.map(s => (s.span_id === span_id ? { ...s, tempLabel: newLabel } : s))
        )
    }

    /** Finalize the edit: copy tempLabel to label, turn off editing. */
    const handleApproveEdit = (span_id: number) => {
        setComponentSpans(prev =>
            prev.map(s => {
                if (s.span_id === span_id) {
                    return { ...s, label: s.tempLabel ?? s.label, editing: false }
                }
                return s
            })
        )
    }

    /**
     * Handle text selection (on mouse up). We'll attempt to detect token-based selection
     * and create a new span in edit mode if it encloses entire tokens.
     */
    const handleMouseUp = () => {
        const sel = window.getSelection()
        if (!sel || sel.isCollapsed) return

        const range = sel.getRangeAt(0)
        if (!range) return

        const startContainer = range.startContainer.parentElement
        const endContainer = range.endContainer.parentElement
        if (!startContainer || !endContainer) return

        // We'll read token indices from data-token-idx
        const startTokenIdx = parseInt(startContainer.getAttribute("data-token-idx") ?? "-1", 10)
        const endTokenIdx = parseInt(endContainer.getAttribute("data-token-idx") ?? "-1", 10)
        if (startTokenIdx < 0 || endTokenIdx < 0) return

        const spanStart = Math.min(startTokenIdx, endTokenIdx)
        const spanEnd = Math.max(startTokenIdx, endTokenIdx) + 1
        if (spanEnd <= spanStart || spanEnd > tokens.length) return

        // Basic check for partial token selection (optional / can be expanded):
        // If we wanted to ensure the selection exactly covers tokens, we could
        // measure offsets in the text nodes. For simplicity, let's skip partial checks.
        // We'll assume the user selected entire tokens.

        const defaultLbl = labelOptions.length ? labelOptions[0] : "MISC"
        const newSpan: EditableSpan = {
            span_id: globalSpanCounter++,
            label: defaultLbl,
            start_token: spanStart,
            end_token: spanEnd,
            editing: true,
            tempLabel: defaultLbl,
        }
        setComponentSpans(prev => [...prev, newSpan])
        // Clear the selection
        sel.removeAllRanges()
    }

    /**
     * Styling changes:
     * 1) Labels are small by default (0.6em).
     * 2) On hover, scale up to 1.2.
     * 3) In editing mode, we make them 2x bigger overall.
     * 4) Edit/remove buttons on the same line with the label.
     */
    const styleTag = (
        <style>
            {`
        .token-wrap {
          user-select: text; 
        }
        /* By default label is 0.6em. On hover, scale it by 1.2. */
        .span-label {
          position: relative;
          border-radius: 3px; 
          padding: 0 3px;
          margin-top: 8px;
          display: inline-flex;
          font-size: 0.6em;
          transition: transform 0.15s;
        }
        .span-label:hover {
          transform: scale(1.2);
          z-index: 10;
        }

        .editing {
          padding: 5px;
          z-index: 10;
          font-size: 0.8em;
          transform: none !important; /* no hover scaling while editing */
        }

        .span-buttons {
          display: inline-flex;
          align-items: center;
          margin-left: 6px;
          gap: 4px;
        }
        /* Hide buttons if not hovered or in editing mode */
        .span-label:not(:hover):not(.editing) .span-buttons {
          display: none;
        }

        .edit-btn, .remove-btn {
          background: #aaa;
          color: white;
          border: none;
          border-radius: 3px;
          font-size: 0.6em; 
          cursor: pointer;
        }
        .edit-btn:hover, .remove-btn:hover {
          background: #555;
        }

        /* Hide remove (cross) button in editing mode */
        .editing .remove-btn {
          display: none;
        }

        .approve-btn {
          background: green;
          color: white;
          border: none;
          border-radius: 3px;
          font-size: 0.6em;
          cursor: pointer;
        }
        .approve-btn:hover {
          background: #005500;
        }

        .edit-dropdown {
          font-size: 1em;
          margin-left: 4px;
        }
      `}
        </style>
    )

    return (
        <div
            ref={containerRef}
            style={{ lineHeight: 2.5, direction: "ltr" }}
            onMouseUp={handleMouseUp}
        >
            {styleTag}
            {perTokenInfo.map((token, tokenIdx) => {
                const entities = [...token.entities].sort((a, b) => a.render_slot - b.render_slot)
                const isWhitespace = token.text.trim() === ""
                if (!entities.length || isWhitespace) {
                    return (
                        <span
                            key={tokenIdx}
                            className="token-wrap"
                            data-token-idx={token.idx}
                        >
              {token.text}{" "}
            </span>
                    )
                }

                const totalHeight =
                    top_offset + span_label_offset + top_offset_step * (entities.length - 1)

                return (
                    <span
                        key={tokenIdx}
                        className="token-wrap"
                        data-token-idx={token.idx}
                        style={{
                            fontWeight: "bold",
                            display: "inline-block",
                            position: "relative",
                            height: totalHeight,
                            marginRight: "2px",
                            userSelect: "text",
                        }}
                    >
            {token.text}
                        {entities.map((entity, eIdx) => {
                            const color = getColor(entity.label)
                            const topPos = top_offset + top_offset_step * (entity.render_slot - 1)

                            const matchingSpan = componentSpans.find(s => s.span_id === entity.span_id)
                            if (!matchingSpan) {
                                // Just the horizontal slice if we can't find the span
                                return (
                                    <span
                                        key={eIdx}
                                        style={{
                                            background: color,
                                            top: topPos,
                                            height: 4,
                                            left: -1,
                                            width: "calc(100% + 2px)",
                                            position: "absolute",
                                        }}
                                    />
                                )
                            }

                            const isEditing = !!matchingSpan.editing
                            return (
                                <React.Fragment key={eIdx}>
                                    {/* The horizontal slice */}
                                    <span
                                        style={{
                                            background: color,
                                            top: topPos,
                                            height: 4,
                                            left: -1,
                                            width: "calc(100% + 2px)",
                                            position: "absolute",
                                        }}
                                    />
                                    {/* If this is the start token, render the label area */}
                                    {entity.is_start && (
                                        <span
                                            style={{
                                                background: color,
                                                top: topPos,
                                                height: 4,
                                                borderTopLeftRadius: 3,
                                                borderBottomLeftRadius: 3,
                                                left: -1,
                                                width: "calc(100% + 2px)",
                                                position: "absolute",
                                            }}
                                        >
                      <span
                          className={`span-label ${isEditing ? "editing" : ""}`}
                          style={{ background: color }}
                      >
                        {isEditing ? (
                            <select
                                className="edit-dropdown"
                                value={matchingSpan.tempLabel}
                                onChange={e =>
                                    handleLabelChange(matchingSpan.span_id, e.target.value)
                                }
                            >
                                {labelOptions.map(lbl => (
                                    <option key={lbl} value={lbl}>
                                        {lbl}
                                    </option>
                                ))}
                            </select>
                        ) : (
                            matchingSpan.label
                        )}

                          <span className="span-buttons">
                          {isEditing ? (
                              <button
                                  className="approve-btn"
                                  onClick={() => handleApproveEdit(matchingSpan.span_id)}
                              >
                                  ✓
                              </button>
                          ) : (
                              <>
                                  <button
                                      className="edit-btn"
                                      onClick={() => handleEditToggle(matchingSpan.span_id)}
                                  >
                                      ✎
                                  </button>
                                  <button
                                      className="remove-btn"
                                      onClick={() => handleRemoveSpan(matchingSpan.span_id)}
                                  >
                                      ✕
                                  </button>
                              </>
                          )}
                        </span>
                      </span>
                    </span>
                                    )}
                                </React.Fragment>
                            )
                        })}
          </span>
                )
            })}
        </div>
    )
}

export default withStreamlitConnection(MySpanComponent)
