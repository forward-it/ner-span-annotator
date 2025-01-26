import os
import streamlit.components.v1 as components

_RELEASE = True

if not _RELEASE:
    _component_func = components.declare_component(
        "ner_span_annotator",
        url="http://localhost:3001",
    )
else:
    parent_dir = os.path.dirname(os.path.abspath(__file__))
    build_dir = os.path.join(parent_dir, "frontend/build")
    _component_func = components.declare_component("ner_span_annotator", path=build_dir)


def ner_span_annotator(name=None, tokens=None, spans=None, labels=None, options=None, key=None, default=0):
    """
    Create a new instance of "my_component", passing tokens and spans.

    Parameters
    ----------
    name : str or None
        Optional name/string to pass to the component.
    tokens : list[str] or None
        List of tokens to render.
    spans : list[dict] or None
        List of spans with keys like {"start_token", "end_token", "label"}.
    labels : list[str] or None
        List of labels to work with.
    options : dict or None
        Additional options to pass to the component.
    key : str or None
        An optional key that uniquely identifies this component.
    default : Any
        The initial return value of the component before user interaction.

    Returns
    -------
    Any
        The component's return value (set via Streamlit.setComponentValue).
    """
    component_value = _component_func(
        name=name,
        tokens=tokens,
        spans=spans,
        labels=labels,
        options=options,
        key=key,
        default=default
    )
    return component_value
