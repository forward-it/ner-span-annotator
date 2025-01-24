import {
    DEFAULT_ENTITY_COLOR,
    DEFAULT_LABEL_COLORS,
    DEFAULT_LANG,
    DEFAULT_DIR,
    TPL_SPANS,
    TPL_SPAN,
    TPL_SPAN_SLICE,
    TPL_SPAN_START,
} from "./constants"
import { escapeHtml } from "./util"
import { Span, TokenMarkup, RendererOptions } from "./types"

export class SpanRenderer {
    private defaultColor: string
    private colors: Record<string, string>
    private direction: string
    private lang: string
    private topOffset: number
    private spanLabelOffset: number
    private offsetStep: number
    private spanTemplate: string
    private spanSliceTemplate: string
    private spanStartTemplate: string

    constructor(options: RendererOptions = {}) {
        const mergedColors = { ...DEFAULT_LABEL_COLORS, ...options.colors }
        this.defaultColor = DEFAULT_ENTITY_COLOR
        this.colors = Object.fromEntries(
            Object.entries(mergedColors).map(([k, v]) => [k.toUpperCase(), v])
        )

        this.direction = DEFAULT_DIR
        this.lang = DEFAULT_LANG
        this.topOffset = options.top_offset ?? 40
        this.spanLabelOffset = options.span_label_offset ?? 20
        this.offsetStep = options.top_offset_step ?? 17

        if (options.template) {
            this.spanTemplate = options.template.span
            this.spanSliceTemplate = options.template.slice
            this.spanStartTemplate = options.template.start
        } else {
            this.spanTemplate = TPL_SPAN
            this.spanSliceTemplate = TPL_SPAN_SLICE
            this.spanStartTemplate = TPL_SPAN_START
        }
    }

    public render(tokens: string[], spans: Span[]): string {
        const perTokenInfo = this.assemblePerTokenInfo(tokens, spans)
        let markup = this.renderMarkup(perTokenInfo)
        markup = TPL_SPANS.replace("{dir}", this.direction).replace("{content}", markup)
        return markup
    }

    private assemblePerTokenInfo(tokens: string[], spans: Span[]): TokenMarkup[] {
        spans = spans.sort((a, b) => {
            const lengthA = a.end_token - a.start_token
            const lengthB = b.end_token - b.start_token
            const sortByStart = a.start_token - b.start_token
            const sortByLength = lengthB - lengthA
            const sortByLabel = a.label.localeCompare(b.label)
            if (sortByStart !== 0) return sortByStart
            if (sortByLength !== 0) return sortByLength
            return sortByLabel
        })

        for (const s of spans) {
            s.render_slot = 0
        }

        const perTokenInfo: TokenMarkup[] = []
        for (let idx = 0; idx < tokens.length; idx++) {
            const token = tokens[idx]
            const intersectingSpans: Span[] = []
            const entities: { label: string; is_start: boolean; render_slot: number }[] = []

            for (const span of spans) {
                if (span.start_token <= idx && idx < span.end_token) {
                    const isStart = idx === span.start_token
                    if (isStart) {
                        span.render_slot = (intersectingSpans[intersectingSpans.length - 1]?.render_slot ?? 0) + 1
                    }
                    intersectingSpans.push(span)
                    entities.push({
                        label: span.label,
                        is_start: isStart,
                        render_slot: span.render_slot ?? 0,
                    })
                } else {
                    span.render_slot = 0
                }
            }
            perTokenInfo.push({ text: token, entities })
        }
        return perTokenInfo
    }

    private renderMarkup(perTokenInfo: TokenMarkup[]): string {
        let markup = ""
        for (const token of perTokenInfo) {
            const entities = [...token.entities].sort((a, b) => a.render_slot - b.render_slot)
            const isWhitespace = token.text.trim() === ""
            if (entities.length && !isWhitespace) {
                const slices = this.getSpanSlices(entities)
                const starts = this.getSpanStarts(entities)
                const totalHeight =
                    this.topOffset + this.spanLabelOffset + this.offsetStep * (entities.length - 1)
                markup += this.spanTemplate
                    .replace("{text}", escapeHtml(token.text))
                    .replace("{span_slices}", slices)
                    .replace("{span_starts}", starts)
                    .replace("{total_height}", totalHeight.toString())
            } else {
                markup += escapeHtml(token.text + " ")
            }
        }
        return markup
    }

    private getSpanSlices(entities: { label: string; render_slot: number }[]): string {
        return entities
            .map((entity) => {
                const color = this.colors[entity.label.toUpperCase()] || this.defaultColor
                const topOffset = this.topOffset + this.offsetStep * (entity.render_slot - 1)
                return this.spanSliceTemplate
                    .replace("{bg}", color)
                    .replace("{top_offset}", topOffset.toString())
            })
            .join("")
    }

    private getSpanStarts(entities: { label: string; is_start: boolean; render_slot: number }[]): string {
        return entities
            .map((entity) => {
                if (!entity.is_start) return ""
                const color = this.colors[entity.label.toUpperCase()] || this.defaultColor
                const topOffset = this.topOffset + this.offsetStep * (entity.render_slot - 1)
                return this.spanStartTemplate
                    .replace("{bg}", color)
                    .replace("{top_offset}", topOffset.toString())
                    .replace("{label}", entity.label)
            })
            .join("")
    }
}
