export const DEFAULT_LANG = "en"
export const DEFAULT_DIR = "ltr"
export const DEFAULT_ENTITY_COLOR = "#ddd"

export const DEFAULT_LABEL_COLORS: Record<string, string> = {
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

export const TPL_SPANS = `
<div class="spans" style="line-height: 2.5; direction: {dir}">{content}</div>
`

export const TPL_SPAN = `
<span style="font-weight: bold; display: inline-block; position: relative; height: {total_height}px;">
    {text}
    {span_slices}
    {span_starts}
</span>
`

export const TPL_SPAN_SLICE = `
<span style="background: {bg}; top: {top_offset}px; height: 4px; left: -1px; width: calc(100% + 2px); position: absolute;">
</span>
`

export const TPL_SPAN_START = `
<span style="background: {bg}; top: {top_offset}px; height: 4px; border-top-left-radius: 3px; border-bottom-left-radius: 3px; left: -1px; width: calc(100% + 2px); position: absolute;">
    <span style="cursor: pointer; background: {bg}; z-index: 10; color: #000; top: -0.5em; padding: 2px 3px; position: relative; font-size: 0.6em; font-weight: bold; line-height: 1; border-radius: 3px">
        {label}
    </span>
</span>
`
