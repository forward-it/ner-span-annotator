import React, { useEffect } from "react"
import { Streamlit, withStreamlitConnection, ComponentProps } from "streamlit-component-lib"
import { SpanRenderer } from "./SpanRenderer"
import { Span, RendererOptions } from "./types"

function MySpanComponent({ args }: ComponentProps) {
    // Data passed from Python
    const tokens: string[] = args["tokens"] ?? []
    const spans: Span[] = args["spans"] ?? []

    const rendererOptions: RendererOptions = args["options"] ?? {}

    // Render spans using our SpanRenderer
    const renderer = new SpanRenderer(rendererOptions)
    const htmlString = renderer.render(tokens, spans)

    // Adjust frame height to fit content
    useEffect(() => {
        Streamlit.setFrameHeight()
    }, [htmlString])

    // Display rendered HTML
    return <div dangerouslySetInnerHTML={{ __html: htmlString }} />
}

// Establish connection with Streamlit
export default withStreamlitConnection(MySpanComponent)
