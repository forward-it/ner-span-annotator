import React, {
    useCallback,
    useEffect,
    useMemo,
    useState,
} from "react"
import { Streamlit, withStreamlitConnection, ComponentProps } from "streamlit-component-lib"
import { RiEditFill } from "react-icons/ri"

/** Each span references character offsets in the text. */
export interface Span {
    start_token: number    // inclusive
    end_token: number      // exclusive
    label: string
    render_slot?: number
}

/** RendererOptions can still be passed in `args["options"]` if desired. */
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

/** Our local version tracks editing state. */
interface EditableSpan extends Span {
    span_id: number
    editing?: boolean
    tempLabel?: string
}

/** The entity info assigned to each “character.” */
interface CharEntity {
    label: string
    span_id: number
    is_start: boolean
    render_slot: number
}

/** We store each character’s text, idx, and the list of entities overlapping it. */
interface CharMarkup {
    ch: string
    idx: number
    entities: CharEntity[]
}

/**
 * Sort spans (longer first if they start at the same char),
 * assign `render_slot` so overlapping spans can stack,
 * and produce per-character info for rendering.
 */
function assemblePerCharInfo(chars: string[], spans: EditableSpan[]): CharMarkup[] {
    // Sort so that for the same start, longer spans get assigned higher slot
    spans.sort((a, b) => {
        const lenA = a.end_token - a.start_token
        const lenB = b.end_token - b.start_token
        const startDiff = a.start_token - b.start_token
        if (startDiff !== 0) return startDiff
        if (lenB !== lenA) return lenB - lenA
        // Tiebreak: alphabetical label
        return a.label.localeCompare(b.label)
    })

    // Reset each span's render_slot
    spans.forEach(s => (s.render_slot = 0))

    const out: CharMarkup[] = []
    for (let i = 0; i < chars.length; i++) {
        const ch = chars[i]
        const intersectingSpans: EditableSpan[] = []
        const entities: CharEntity[] = []

        for (const span of spans) {
            if (span.start_token <= i && i < span.end_token) {
                const isStart = i === span.start_token
                if (isStart) {
                    // If this is the first span in this char, render_slot = 1
                    // else +1 from the last intersecting
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
            }
        }

        out.push({
            ch,
            idx: i,
            entities,
        })
    }
    return out
}

let globalSpanCounter = 1

function NerSpanAnnotator({ args }: ComponentProps) {
    // 1) Accept `text` (string) instead of `tokens`.
    const text: string = args["text"] ?? ""
    const rawSpans: Span[] = args["spans"] ?? []
    const allowedLabels: string[] = args["labels"] ?? []

    // 2) Use the same top_offset logic for layering lines.
    const options: RendererOptions = args["options"] ?? {}
    const {
        top_offset = 40,
        span_label_offset = 20,
        top_offset_step = 17,
        colors = {},
    } = options

    // Merge user-provided colors with defaults:
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

    // 3) Convert text → array of single characters
    const charArray = useMemo(() => text.split(""), [text])

    // 4) Convert incoming spans → local EditableSpan
    const toEditableSpans = useCallback(
        (arr: Span[]): EditableSpan[] =>
            arr
                // Filter out if label is not in allowedLabels
                .filter(s => allowedLabels.includes(s.label))
                .map(s => ({
                    ...s,
                    span_id: globalSpanCounter++,
                    editing: false,
                    tempLabel: s.label,
                })),
        [allowedLabels]
    )

    // Local state
    const [componentSpans, setComponentSpans] = useState<EditableSpan[]>(() =>
        toEditableSpans(rawSpans)
    )

    // 5) Build per-character info for each render
    const perCharInfo = useMemo(
        () => assemblePerCharInfo(charArray, componentSpans),
        [charArray, componentSpans]
    )

    // 6) Whenever local spans change, send them up to Streamlit
    useEffect(() => {
        const plainSpans = componentSpans.map(({ span_id, editing, tempLabel, render_slot, ...rest }) => rest)
        Streamlit.setComponentValue(plainSpans)
    }, [componentSpans])

    // 7) Re-size the iframe after each render
    useEffect(() => {
        Streamlit.setFrameHeight()
    }, [perCharInfo])

    // Editing logic
    const handleRemoveSpan = (span_id: number) => {
        setComponentSpans(prev => prev.filter(s => s.span_id !== span_id))
    }

    const handleEditToggle = (span_id: number) => {
        setComponentSpans(prev =>
            prev.map(s => {
                if (s.span_id === span_id) {
                    return {
                        ...s,
                        editing: !s.editing,
                        tempLabel: s.editing ? s.label : s.tempLabel,
                    }
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

    // 8) Adjust boundaries in single-char steps
    function clamp(num: number, minN: number, maxN: number): number {
        return Math.min(Math.max(num, minN), maxN)
    }

    // ---------- Word-based boundary adjustments ----------
    function isWhitespace(ch: string): boolean {
        return /\s/.test(ch)
    }

    /** Move the start boundary left by one word. */
    function moveStartLeft(s: EditableSpan): number {
        if (s.start_token <= 0) return s.start_token
        let i = s.start_token - 1
        while (i > 0 && isWhitespace(text[i])) i--
        while (i > 0 && !isWhitespace(text[i - 1])) i--
        return Math.max(0, i)
    }

    /** Move the start boundary right by one word. */
    function moveStartRight(s: EditableSpan): number {
        if (s.start_token >= text.length - 1) return s.start_token
        let i = s.start_token
        const len = text.length
        // skip current "word"
        while (i < len && !isWhitespace(text[i])) i++
        // skip whitespace
        while (i < len && isWhitespace(text[i])) i++
        if (i >= s.end_token) {
            i = s.end_token - 1
            if (i < 0) i = 0
        }
        return i
    }

    /** Move the end boundary left by one word. */
    function moveEndLeft(s: EditableSpan): number {
        if (s.end_token <= s.start_token + 1) return s.end_token
        let i = s.end_token - 1
        while (i > s.start_token && isWhitespace(text[i])) i--
        while (i > s.start_token && !isWhitespace(text[i - 1])) i--
        if (i <= s.start_token) i = s.start_token + 1
        return i
    }

    /** Move the end boundary right by one word. */
    function moveEndRight(s: EditableSpan): number {
        if (s.end_token >= text.length) return s.end_token
        let i = s.end_token
        const len = text.length
        // skip whitespace
        while (i < len && isWhitespace(text[i])) i++
        // skip next word
        while (i < len && !isWhitespace(text[i])) i++
        if (i <= s.start_token) i = s.start_token + 1
        if (i > len) i = len
        return i
    }

    const adjustStart = (span_id: number, dir: "left" | "right") => {
        setComponentSpans(prev =>
            prev.map(s => {
                if (s.span_id !== span_id) return s
                let newStart = s.start_token
                if (dir === "left") {
                    newStart = moveStartLeft(s)
                } else {
                    newStart = moveStartRight(s)
                }
                // clamp so we never invert start >= end
                if (newStart >= s.end_token) {
                    newStart = s.end_token - 1
                    if (newStart < 0) newStart = 0
                }
                return { ...s, start_token: newStart }
            })
        )
    }

    const adjustEnd = (span_id: number, dir: "left" | "right") => {
        setComponentSpans(prev =>
            prev.map(s => {
                if (s.span_id !== span_id) return s
                let newEnd = s.end_token
                if (dir === "left") {
                    newEnd = moveEndLeft(s)
                } else {
                    newEnd = moveEndRight(s)
                }
                if (newEnd <= s.start_token) {
                    newEnd = s.start_token + 1
                }
                return { ...s, end_token: newEnd }
            })
        )
    }

    // 9) Create new span on highlight
    const handleMouseUp = () => {
        const sel = window.getSelection()
        if (!sel || sel.isCollapsed) return

        const range = sel.getRangeAt(0)
        if (!range) return

        const startParent = range.startContainer.parentElement
        const endParent = range.endContainer.parentElement
        if (!startParent || !endParent) return

        // We store data-ch-idx on each character
        const startIdx = parseInt(startParent.getAttribute("data-ch-idx") ?? "-1", 10)
        const endIdx = parseInt(endParent.getAttribute("data-ch-idx") ?? "-1", 10)
        if (startIdx < 0 || endIdx < 0) return

        const spanStart = Math.min(startIdx, endIdx)
        const spanEnd = Math.max(startIdx, endIdx) + 1
        if (spanEnd <= spanStart || spanEnd > charArray.length) return

        const defaultLbl = allowedLabels.length ? allowedLabels[0] : "MISC"
        const newSpan: EditableSpan = {
            span_id: globalSpanCounter++,
            label: defaultLbl,
            start_token: spanStart,
            end_token: spanEnd,
            editing: true,
            tempLabel: defaultLbl,
        }

        setComponentSpans(prev => [...prev, newSpan])
        sel.removeAllRanges()
    }

    // 10) Style block is basically the same, except we’re dealing with char-based logic
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

    // 11) Render each character in a <span data-ch-idx=...>.
    // If no entities for that char, just output the char. If there are entities, draw the layered lines above it.
    return (
        <div style={{ lineHeight: 2.5, direction: "ltr" }} onMouseUp={handleMouseUp}>
            {styleTag}
            {perCharInfo.map((charInfo, idx) => {
                const sortedEntities = [...charInfo.entities].sort(
                    (a, b) => a.render_slot - b.render_slot
                )
                const isWhitespace = charInfo.ch.trim() === ""
                if (!sortedEntities.length || isWhitespace) {
                    // Just render the single character with data-ch-idx
                    return (
                        <span key={idx} className="token-wrap" data-ch-idx={charInfo.idx}>
                            {charInfo.ch}
                        </span>
                    )
                }

                // We have one or more spans covering this character.
                // We'll do the same offset-based approach as the original code.
                const totalHeight =
                    top_offset + span_label_offset + top_offset_step * (sortedEntities.length - 1)

                return (
                    <span
                        key={idx}
                        className="token-wrap"
                        data-ch-idx={charInfo.idx}
                        style={{
                            fontWeight: "bold",
                            display: "inline-block",
                            position: "relative",
                            height: totalHeight,
                            marginRight: "2px",
                        }}
                    >
                        {charInfo.ch}
                        {sortedEntities.map((entity, eIdx) => {
                            const color = mergedColors[entity.label.toUpperCase()] || defaultColor
                            const topPos = top_offset + top_offset_step * (entity.render_slot - 1)

                            const spanObj = componentSpans.find(s => s.span_id === entity.span_id)
                            if (!spanObj) {
                                // Just draw the color line
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
                                    {/* Horizontal colored slice */}
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
                                            {/* The "label bubble" we show only at the span start char */}
                                            <span
                                                className={`span-label ${isEditing ? "editing" : ""}`}
                                                style={{ background: color, position: "relative" }}
                                            >
                                                {/* Left boundary arrows (only show if editing) */}
                                                <div className="extend-controls left-extend">
                                                    <button
                                                        className="extend-btn"
                                                        onClick={() => adjustStart(spanObj.span_id, "left")}
                                                    >
                                                        ←
                                                    </button>
                                                    <button
                                                        className="extend-btn"
                                                        onClick={() => adjustStart(spanObj.span_id, "right")}
                                                    >
                                                        →
                                                    </button>
                                                </div>

                                                {/* The label or dropdown */}
                                                {isEditing ? (
                                                    <select
                                                        style={{ marginLeft: 6 }}
                                                        value={spanObj.tempLabel}
                                                        onChange={e =>
                                                            handleLabelChange(spanObj.span_id, e.target.value)
                                                        }
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

                                                {/* Right boundary arrows (only if editing) */}
                                                <div className="extend-controls right-extend">
                                                    <button
                                                        className="extend-btn"
                                                        onClick={() => adjustEnd(spanObj.span_id, "left")}
                                                    >
                                                        ←
                                                    </button>
                                                    <button
                                                        className="extend-btn"
                                                        onClick={() => adjustEnd(spanObj.span_id, "right")}
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
