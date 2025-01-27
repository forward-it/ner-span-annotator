import streamlit as st
from ner_span_annotator import ner_span_annotator

# Add some test code to play with the component while it's in development.
# During development, we can run this just as we would any other Streamlit
# app: `$ streamlit run ner_span_annotator/example.py`

st.subheader("Component demo")

text = "Welcome to the Bank of China."
spans = [
    {"start_token": 15, "end_token": 28, "label": "ORG"},
    {"start_token": 23, "end_token": 28, "label": "GPE"},
]

result = ner_span_annotator(
    text=text,
    spans=spans,
    labels=["ORG", "GPE"]
)

st.json(result)