import React, {
    useCallback,
    useEffect,
    useMemo,
    useState,
} from "react"
import { Streamlit, withStreamlitConnection, ComponentProps } from "streamlit-component-lib"
import { RiEditFill } from "react-icons/ri";

export interface Span {
    start_token: number
    end_token: number
    label: string
    render_slot?: number
}

export interface RendererOptions {
    colors?: Record<string, string>
    top_offset?: number
    span_label_offset?: number
    top_offset_step?: number
    template?: {
        span: string
        slice: string
        start: string
    }
}

interface EditableSpan extends Span {
    span_id: number
    editing?: boolean
    tempLabel?: string
}

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

/** Sort spans, assign render_slot, and produce token-level info. */
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

        for (const span of spans) {
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
        }
        perTokenInfo.push({ text: token, idx: i, entities })
    }
    return perTokenInfo
}

let globalSpanCounter = 1

function NerSpanAnnotator({ args }: ComponentProps) {
    const tokens: string[] = args["tokens"] ?? []
    const rawSpans: Span[] = args["spans"] ?? []
    const allowedLabels: string[] = args["labels"] ?? []

    // Filter out any spans whose label isn't in allowedLabels
    const filteredRawSpans = useMemo(
        () => rawSpans.filter(s => allowedLabels.includes(s.label)),
        [rawSpans, allowedLabels]
    )

    const options: RendererOptions = args["options"] ?? {}
    const { top_offset = 40, span_label_offset = 20, top_offset_step = 17, colors = {} } = options

    const defaultColors: Record<string, string> = {
        ORG: "#7aecec",
        PRODUCT: "#bfeeb7",
        GPE: "#feca74",
        LOC: "#ff9561",
        PERSON: "#aa9cfc",
        NORP: "#c887fb",
        FAC: "#9cc9cc",
        EVENT: "#ffeb80",
        LAW: "#ff8197",
        LANGUAGE: "#ff8197",
        WORK_OF_ART: "#f0d0ff",
        DATE: "#bfe1d9",
        TIME: "#bfe1d9",
        MONEY: "#e4e7d2",
        QUANTITY: "#e4e7d2",
        ORDINAL: "#e4e7d2",
        CARDINAL: "#e4e7d2",
        PERCENT: "#e4e7d2",
    }
    const mergedColors = { ...defaultColors, ...colors }
    const defaultColor = "#ddd"

    // Convert incoming spans → local EditableSpan
    const toEditableSpans = useCallback((arr: Span[]): EditableSpan[] =>
            arr.map(s => ({
                ...s,
                span_id: globalSpanCounter++,
                editing: false,
                tempLabel: s.label,
            }))
        , [])

    // Local spans state, derived from filteredRawSpans
    const [componentSpans, setComponentSpans] = useState<EditableSpan[]>(() =>
        toEditableSpans(filteredRawSpans)
    )

    // Recompute token info each render
    const perTokenInfo = useMemo(
        () => assemblePerTokenInfo(tokens, componentSpans),
        [tokens, componentSpans]
    )

    // Whenever local spans change, send them up to Streamlit
    useEffect(() => {
        const plainSpans = componentSpans.map(({ span_id, editing, tempLabel, ...rest }) => rest)
        Streamlit.setComponentValue(plainSpans)
    }, [componentSpans])

    // Call setFrameHeight after each render
    useEffect(() => {
        Streamlit.setFrameHeight()
    }, [perTokenInfo])

    // Edits/removes
    const handleRemoveSpan = (span_id: number) => {
        setComponentSpans(prev => prev.filter(s => s.span_id !== span_id))
    }

    const handleEditToggle = (span_id: number) => {
        setComponentSpans(prev =>
            prev.map(s => {
                if (s.span_id === span_id) {
                    // Toggling off => reset tempLabel if needed
                    return { ...s, editing: !s.editing, tempLabel: s.editing ? s.label : s.tempLabel }
                }
                return s
            })
        )
    }

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

    const handleLabelChange = (span_id: number, newLabel: string) => {
        setComponentSpans(prev =>
            prev.map(s => (s.span_id === span_id ? { ...s, tempLabel: newLabel } : s))
        )
    }

    // Adjust boundaries
    const clamp = (val: number, minVal: number, maxVal: number) =>
        Math.min(Math.max(val, minVal), maxVal)

    const handleMoveStartTokenLeft = (span_id: number) => {
        setComponentSpans(prev =>
            prev.map(s => {
                if (s.span_id === span_id) {
                    const newStart = clamp(s.start_token - 1, 0, s.end_token - 1)
                    return { ...s, start_token: newStart }
                }
                return s
            })
        )
    }
    const handleMoveStartTokenRight = (span_id: number) => {
        setComponentSpans(prev =>
            prev.map(s => {
                if (s.span_id === span_id) {
                    const newStart = clamp(s.start_token + 1, 0, s.end_token - 1)
                    return { ...s, start_token: newStart }
                }
                return s
            })
        )
    }

    const handleMoveEndTokenRight = (span_id: number) => {
        setComponentSpans(prev =>
            prev.map(s => {
                if (s.span_id === span_id) {
                    const newEnd = clamp(s.end_token - 1, s.start_token + 1, tokens.length)
                    return { ...s, end_token: newEnd }
                }
                return s
            })
        )
    }
    const handleMoveEndTokenLeft = (span_id: number) => {
        setComponentSpans(prev =>
            prev.map(s => {
                if (s.span_id === span_id) {
                    const newEnd = clamp(s.end_token + 1, s.start_token + 1, tokens.length)
                    return { ...s, end_token: newEnd }
                }
                return s
            })
        )
    }

    // Create new span on text selection
    const handleMouseUp = () => {
        const sel = window.getSelection()
        if (!sel || sel.isCollapsed) return

        const range = sel.getRangeAt(0)
        if (!range) return

        const startParent = range.startContainer.parentElement
        const endParent = range.endContainer.parentElement
        if (!startParent || !endParent) return

        const startIdx = parseInt(startParent.getAttribute("data-token-idx") ?? "-1", 10)
        const endIdx = parseInt(endParent.getAttribute("data-token-idx") ?? "-1", 10)
        if (startIdx < 0 || endIdx < 0) return

        const spanStart = Math.min(startIdx, endIdx)
        const spanEnd = Math.max(startIdx, endIdx) + 1
        if (spanEnd <= spanStart || spanEnd > tokens.length) return

        // Just pick the first allowed label, or fallback
        const defaultLbl = allowedLabels.length ? allowedLabels[0] : "MISC"

        const newSpan: EditableSpan = {
            span_id: globalSpanCounter++,
            label: defaultLbl,
            start_token: spanStart,
            end_token: spanEnd,
            editing: true,      // auto-open in edit mode
            tempLabel: defaultLbl,
        }

        setComponentSpans(prev => [...prev, newSpan])
        sel.removeAllRanges()
    }

    const styleTag = (
        <style>
            {`
      .token-wrap {
        user-select: text;
      }
      .span-label {
        position: relative;
        display: inline-flex;
        font-size: 0.6em;
        transition: transform 0.15s;
        padding: 0 3px;
        margin-top: 4px;
        border-radius: 3px;
      }
      .span-label:hover {
        transform: scale(1.2);
        z-index: 10;
      }
      .editing {
        z-index: 100;
        padding: 10px;
        font-size: 1.2em !important;
        transform: none !important;
      }
      .span-buttons {
        display: inline-flex;
        align-items: center;
        margin-left: 6px;
        gap: 4px;
      }
      .span-label:not(:hover):not(.editing) .span-buttons {
        display: none;
      }
      .edit-btn, .remove-btn {
        background: #333333;
        color: white;
        border: none;
        border-radius: 3px;
        font-size: 0.6em;
        cursor: pointer;
      }
      .edit-btn:hover, .remove-btn:hover {
        background: #555;
      }
      .remove-btn {
        background: #EE0000;
      }
      .approve-btn {
        background: #008000;
        color: white;
        border: none;
        border-radius: 3px;
        font-size: 0.6em;
        margin-right: 10px;
        width: 30px;
        cursor: pointer;
      }
      .approve-btn:hover {
        background: #008000;
      }
      .editing .remove-btn {
        display: none;
      }

      /* The left/right arrow columns in edit mode */
      .extend-controls {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      /* Hide if not editing */
      .span-label:not(.editing) .extend-controls {
        display: none;
      }

      .extend-btn {
        background: #666;
        color: #fff;
        border: none;
        border-radius: 3px;
        font-size: 0.3em;
        cursor: pointer;
        padding: 0 4px;
        height: 50%;
      }
      .extend-btn:hover {
        background: #333;
      }
    `}
        </style>
    )

    return (
        <div style={{ lineHeight: 2.5, direction: "ltr" }} onMouseUp={handleMouseUp}>
            {styleTag}
            {perTokenInfo.map((token, tokenIdx) => {
                const sortedEntities = [...token.entities].sort((a, b) => a.render_slot - b.render_slot)
                const isWhitespace = token.text.trim() === ""
                if (!sortedEntities.length || isWhitespace) {
                    // Each token is rendered in a span with a data-token-idx,
                    // so we can identify it on text selection.
                    return (
                        <span key={tokenIdx} className="token-wrap" data-token-idx={token.idx}>
              {token.text}{" "}
            </span>
                    )
                }

                const totalHeight =
                    top_offset + span_label_offset + top_offset_step * (sortedEntities.length - 1)

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
                        }}
                    >
            {token.text}
                        {sortedEntities.map((entity, eIdx) => {
                            const color = mergedColors[entity.label.toUpperCase()] || defaultColor
                            const topPos = top_offset + top_offset_step * (entity.render_slot - 1)

                            const spanObj = componentSpans.find(s => s.span_id === entity.span_id)
                            if (!spanObj) {
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

                            const isEditing = !!spanObj.editing

                            return (
                                <React.Fragment key={eIdx}>
                                    {/* Horizontal slice */}
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
                          style={{ background: color, position: "relative" }}
                      >
                        {/* In edit mode: vertical column of ↑ and ↓ on the left side */}
                          <div className="extend-controls left-extend">
                          <button
                              className="extend-btn"
                              onClick={() => handleMoveStartTokenLeft(spanObj.span_id)}
                          >
                            ←
                          </button>
                          <button
                              className="extend-btn"
                              onClick={() => handleMoveStartTokenRight(spanObj.span_id)}
                          >
                            →
                          </button>
                        </div>

                          {/* The label or dropdown */}
                          {isEditing ? (
                              <select
                                  style={{ marginLeft: 6 }}
                                  value={spanObj.tempLabel}
                                  onChange={e => handleLabelChange(spanObj.span_id, e.target.value)}
                              >
                                  {allowedLabels.map(label => (
                                      <option key={label} value={label}>
                                          {label}
                                      </option>
                                  ))}
                              </select>
                          ) : (
                              spanObj.label
                          )}
                          {/* Edit/Remove/Approve buttons */}
                          <span className="span-buttons">
                          {isEditing ? (
                              <button
                                  className="approve-btn"
                                  onClick={() => handleApproveEdit(spanObj.span_id)}
                              >
                                  ✓
                              </button>
                          ) : (
                              <>
                                  <button
                                      className="edit-btn"
                                      onClick={() => handleEditToggle(spanObj.span_id)}
                                  >
                                      <RiEditFill />
                                  </button>
                                  <button
                                      className="remove-btn"
                                      onClick={() => handleRemoveSpan(spanObj.span_id)}
                                  >
                                      ✕
                                  </button>
                              </>
                          )}
                        </span>

                          {/* Right side arrows */}
                          <div className="extend-controls right-extend">
                          <button
                              className="extend-btn"
                              onClick={() => handleMoveEndTokenRight(spanObj.span_id)}
                          >
                            ←
                          </button>
                          <button
                              className="extend-btn"
                              onClick={() => handleMoveEndTokenLeft(spanObj.span_id)}
                          >
                            →
                          </button>
                        </div>
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

export default withStreamlitConnection(NerSpanAnnotator)
