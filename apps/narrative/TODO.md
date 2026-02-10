# Project To-Do List

## 1. Core Data Modeling (Priority: High)

- [x] **Update Pydantic Models (`app/models/swppp.py`)**:
  - [x] Add detailed Section 1 fields (Lat/Long, Soil types, extensive contacts).
  - [ ] Add BMP tracking models (Code, Description, Schedule, Responsible Party) *– Partially extracted, need mapping*.
  - [x] Add "Before/After" calculation fields (Imperviousness, Runoff).
  - [x] Add checkbox/boolean fields (Endangered Species, Historic Preservation).

## 2. Template Refinement

- [x] **Update `cgp_p3_template.docx`**:
  - [x] Replace static placeholders with Jinja2 tags for all new Section 1 variables.
  - [x] Add Lat/Long and Checkbox placeholders.
  - [ ] Add logic loops for BMP lists (Section 2 & 3).
  - [ ] Test table row generation for dynamic lists (e.g., multiple operators).

## 3. Logic & Calculations

- [x] **Implement Calculations**:
  - [x] Auto-calculate disturbed area (via Merge logic).
  - [ ] Calculate runoff coefficients based on soil inputs.
- [x] **Merge Logic**:
  - [x] Create a service to merge "Extracted Estimate Data" + "Extracted Storm Plan Data" -> "Final SWPPP Data" (`SWPPPDataMapper`).

## 4. Workflow & User Interface

- [x] **Create End-to-End Pipeline**:
  - [x] Build master script `generate_swppp.py`.
  - [x] Implement "Intermediate Review" step (save JSON before Gen).
- [ ] **Create Review UI**:
  - [ ] Build a simple web interface (Streamlit/FastAPI) to:
        1. Upload PDFs.
        2. Display the `intermediate_swppp_data.json` in a form.
        3. Allow manual edits/corrections.
        4. Button: "Approve & Generate .docx".

## 5. Testing

- [ ] Create a "Golden Master" test case with a known good SWPPP for regression testing.
- [ ] Test with diverse PDF formats (different engineering firms).
