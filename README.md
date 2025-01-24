# ner-span-annotator

Streamlit component that allows you to visualize and modify NER annotations

## Installation instructions

```sh
pip install ner_span_annotator
```

## Usage instructions

```python
import streamlit as st

from ner_span_annotator import ner_span_annotator

spans = [
    {"start_token": 3, "end_token": 6, "label": "ORG"},
    {"start_token": 5, "end_token": 6, "label": "GPE"},
]
tokens = ["Welcome", "to", "the", "Bank", "of", "China", "."]

result = ner_span_annotator(tokens=tokens, spans=spans, labels=["ORG", "GPE"])

st.json(result)
```