"""
executar_pipeline.py — executa as etapas 01, 02 e 03 em sequência.

Cada etapa roda como processo separado (mesmo interpretador), com log e tempo
de execução; a primeira falha interrompe o pipeline com código de saída 1.
A publicação no Supabase (04) é opcional e fica fora desta sequência por exigir
credenciais.

Uso: ``python pipeline/executar_pipeline.py``
"""
from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
ETAPAS = [
    ("01 — geração da base sintética", "pipeline/01_gerar_dados_sinteticos.py"),
    ("02 — preparação, treino e explicabilidade", "pipeline/02_preparar_e_treinar.py"),
    ("03 — exportação de artefatos (cópia JSON e seeds SQL)", "pipeline/03_exportar_artefatos.py"),
]


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass
    ambiente = {**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1"}
    t_total = time.time()
    for titulo, script in ETAPAS:
        print(f"\n{'=' * 78}\n{titulo}\n{'=' * 78}", flush=True)
        t0 = time.time()
        resultado = subprocess.run([sys.executable, str(RAIZ / script)], cwd=RAIZ, env=ambiente)
        duracao = time.time() - t0
        if resultado.returncode != 0:
            print(f"\nFALHA na etapa '{titulo}' após {duracao:.1f}s (código {resultado.returncode}).")
            return 1
        print(f"\nEtapa concluída em {duracao:.1f}s.", flush=True)
    print(f"\nPipeline concluído em {time.time() - t_total:.1f}s.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
