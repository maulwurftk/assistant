"""
Erzeugt Trainingsbeispiele aus dem aktuellen Code der assistenten-app.
Fuer jede Code-Datei/jeden Chunk wird ueber die lokale Ollama-API (qwen2.5-coder)
eine passende Aufgabenstellung (Instruction) generiert. Der echte Code bleibt der Output.

WICHTIG: Dieses Skript braucht Zugriff auf deine lokale Ollama-Instanz (http://localhost:11434)
und muss deshalb LOKAL AUF DEINEM PC ausgefuehrt werden (nicht im Sandbox-Tool).

Ausfuehren im Projektordner:
    pip install requests
    python llm-training/generate_code_instructions.py
"""

import os
import re
import json
import time
import requests

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(REPO_ROOT, "src")
OUT_FILE = os.path.join(REPO_ROOT, "llm-training", "own_code_instructions_dataset.json")

OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL = "qwen2.5-coder:7b-instruct"

INCLUDE_EXT = (".ts", ".tsx")
EXCLUDE_DIRS = {"node_modules", ".next", "__tests__", "types"}
MIN_CHARS = 150
MAX_CHARS = 4000
MAX_EXAMPLES = 150  # Obergrenze, damit der Lauf in endlicher Zeit fertig wird

SYSTEM_CONTEXT = (
    "Du bist ein Code-Analyst. Du bekommst einen Ausschnitt aus einer "
    "Next.js/TypeScript/Supabase Multi-Tenant-Webanwendung (assistenten-app). "
    "Formuliere in 1-2 praegnanten Saetzen (Deutsch), welche Aufgabe/Anforderung "
    "dieser Code erfuellt - so, wie ein Product Owner oder Entwickler die Aufgabe "
    "VOR der Umsetzung beschrieben haette. Gib NUR die Aufgabenbeschreibung zurueck, "
    "keine Einleitung, keine Codebloecke, keine Anfuehrungszeichen."
)


def find_code_chunks():
    chunks = []
    for root, dirs, files in os.walk(SRC_DIR):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        for fname in files:
            if not fname.endswith(INCLUDE_EXT):
                continue
            path = os.path.join(root, fname)
            try:
                with open(path, "r", encoding="utf-8") as f:
                    content = f.read()
            except Exception:
                continue

            if len(content) < MIN_CHARS:
                continue

            rel = os.path.relpath(path, REPO_ROOT)

            if len(content) <= MAX_CHARS:
                chunks.append((rel, content))
            else:
                # grob an Top-Level export-Bloecken splitten
                parts = re.split(r"(?=^export (?:function|const|default function|class) )", content, flags=re.MULTILINE)
                for part in parts:
                    if MIN_CHARS <= len(part) <= MAX_CHARS:
                        chunks.append((rel, part))
    return chunks


def ask_ollama(code_snippet):
    prompt = f"{SYSTEM_CONTEXT}\n\nCode:\n```\n{code_snippet}\n```\n\nAufgabenbeschreibung:"
    resp = requests.post(
        OLLAMA_URL,
        json={"model": MODEL, "prompt": prompt, "stream": False, "options": {"temperature": 0.3}},
        timeout=120,
    )
    resp.raise_for_status()
    return resp.json().get("response", "").strip()


def main():
    chunks = find_code_chunks()
    print(f"Gefundene Code-Chunks: {len(chunks)}")
    if len(chunks) > MAX_EXAMPLES:
        # gleichmaessig ueber die Liste sampeln statt nur die ersten N
        step = len(chunks) / MAX_EXAMPLES
        chunks = [chunks[int(i * step)] for i in range(MAX_EXAMPLES)]
        print(f"Auf {len(chunks)} Beispiele reduziert (MAX_EXAMPLES)")

    examples = []
    for i, (rel_path, code) in enumerate(chunks, 1):
        try:
            instruction = ask_ollama(code)
        except Exception as e:
            print(f"[{i}/{len(chunks)}] Fehler bei {rel_path}: {e}")
            continue

        if not instruction:
            continue

        examples.append({
            "instruction": instruction,
            "input": "",
            "output": code,
            "system": f"Du bist ein erfahrener Entwickler an der assistenten-app. Datei: {rel_path}"
        })
        print(f"[{i}/{len(chunks)}] {rel_path} -> OK")

        if i % 10 == 0:
            with open(OUT_FILE, "w", encoding="utf-8") as f:
                json.dump(examples, f, ensure_ascii=False, indent=2)

    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(examples, f, ensure_ascii=False, indent=2)

    print(f"\nFertig: {len(examples)} Beispiele geschrieben nach {OUT_FILE}")


if __name__ == "__main__":
    main()
