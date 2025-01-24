export interface Span {
    start_token: number
    end_token: number
    label: string
    render_slot?: number
}

export interface TokenMarkup {
    text: string
    entities: {
        label: string
        is_start: boolean
        render_slot: number
    }[]
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