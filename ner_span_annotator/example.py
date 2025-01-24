import streamlit as st
from ner_span_annotator import ner_span_annotator

# Add some test code to play with the component while it's in development.
# During development, we can run this just as we would any other Streamlit
# app: `$ streamlit run my_component/example.py`

st.subheader("Component demo")

spans = [
    {"start_token": 3, "end_token": 6, "label": "ORG"},
    {"start_token": 5, "end_token": 6, "label": "GPE"},
]
tokens = ["Welcome", "to", "the", "Bank", "of", "China", "."]

# Create an instance of our component with a constant `name` arg, and
# print its output value.
result = ner_span_annotator(tokens=tokens, spans=spans, labels=["ORG", "GPE"])

st.json(result)