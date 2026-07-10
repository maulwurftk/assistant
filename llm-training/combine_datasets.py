"""
Fuehrt alle drei Teil-Datensaetze zu einem finalen Trainingsdatensatz zusammen:
  - own_code_git_dataset.json            (aus Git-Historie, bereits fertig)
  - own_code_instructions_dataset.json   (aus aktuellem Code + Ollama, erst nach
                                           generate_code_instructions.py vorhanden)
  - public_codealpaca_sample.json        (oeffentlicher Datensatz, bereits fertig)

Ausfuehren im Projektordner:
    python llm-training/combine_datasets.py
"""

import os
import json

HERE = os.path.dirname(os.path.abspath(__file__))

FILES = [
    "own_code_git_dataset.json",
    "own_code_instructions_dataset.json",
    "public_codealpaca_sample.json",
]

combined = []
for fname in FILES:
    path = os.path.join(HERE, fname)
    if not os.path.exists(path):
        print(f"WARNUNG: {fname} nicht gefunden, wird uebersprungen "
              f"(fuer own_code_instructions_dataset.json erst generate_code_instructions.py ausfuehren)")
        continue
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    print(f"{fname}: {len(data)} Beispiele")
    combined.extend(data)

out_path = os.path.join(HERE, "final_training_dataset.json")
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(combined, f, ensure_ascii=False, indent=2)

print(f"\nGesamt: {len(combined)} Beispiele -> {out_path}")
