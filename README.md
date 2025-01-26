# ner-span-annotator

This Streamlit component enables you to visualize Named Entity Recognition (NER) annotations in the spaCy displacy span style. Additionally, it allows you to modify NER annotations interactively.

![https://github.com/forward-it/ner-span-annotator/raw/main/example.png](example.png)

The implementation includes code partially ported from Python to React, based on the [spaCy repository](https://github.com/explosion/spaCy/tree/master/spacy/displacy).


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

## Development
To set up and run the development environment, follow these steps:

Navigate to the ner_span_annotator/frontend directory and run:

```
npm install    # Initialize the project and install npm dependencies
npm run start  # Start the Webpack dev server
```

Then go to the project root and run the example app:
```
pip install -e . # install template as editable package
streamlit run ner_span_annotator/example.py # run the example
```

