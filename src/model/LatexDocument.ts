/**
 * LatexDocument — the single source of truth for the editor.
 *
 * The document is just two strings:
 *   preamble  — everything between \documentclass and \begin{document}
 *   body      — the raw TikZ/LaTeX content inside \begin{document}…\end{document}
 *
 * The full compilable .tex is assembled by toFullSource().
 */

export const DEFAULT_PREAMBLE = `\\usepackage{amsmath}
\\usepackage{amsfonts}
\\usepackage{amssymb}

\\usepackage{tikz}
\\usepackage{circuitikz}

\\ctikzset{resistors/scale=0.6}
\\ctikzset{inductors/scale=0.8}
\\ctikzset{capacitors/scale=0.6}
\\ctikzset{sources/scale=0.6}
\\ctikzset{amplifiers/scale=0.7}`;

export const DEFAULT_BODY = `\\begin{tikzpicture}[scale=0.7]

\\node[op amp, yscale=-1](N1) at (3, 3){} node[anchor=center] at (N1.text){$U_1$};

\\draw (3,1) to[american resistor, l={$R_2$}] (5,1);
\\draw (1, -0.5) to[capacitor, l={$C_1$}] (3, -0.5);
\\draw (3,-0.5) to[capacitor, l={$C_2$}] (5,-0.5);
\\draw (1, 1) to[american resistor, l={$R_1$}] (3, 1);

\\draw (3,-0.5) -- (3, 1);
\\draw (5,-0.5) |- (N1.out);
\\draw (1, -1) -- (1, 2.5) |- (N1.-);
\\draw (1, -1) to[american resistor, l={$R_0$}] (1, -3);

\\node[sground] at (1, -3){};

\\node[circ] at (3,1) {};
\\node[circ] at (1, 1){};
\\node[circ] at (3,-0.5) {};
\\node[circ] at (1,-0.5) {};
\\node[circ] at (5,1) {};

\\draw (5, 3) -- (5.5, 3);
\\draw (1, 3.5) |- (N1.+);

\\node[circ] at (5, 3){};

\\node[ocirc](N2) at (1, 3.5){} node[anchor=east] at (N2.text){$v_i$};
\\node[ocirc](N3) at (5.5, 3){} node[anchor=west] at (N3.text){$v_o$};

\\end{tikzpicture}`;

export class LatexDocument {
  preamble: string;
  body: string;

  constructor(preamble = DEFAULT_PREAMBLE, body = DEFAULT_BODY) {
    this.preamble = preamble;
    this.body = body;
  }

  /** Full compilable .tex source sent to pdflatex. */
  toFullSource(): string {
    return [
      `\\documentclass[tikz,border=2pt]{standalone}`,
      this.preamble,
      `\\begin{document}`,
      this.body,
      `\\end{document}`,
    ].join('\n');
  }

  /**
   * Parse a full .tex source and update preamble + body in place.
   * Tolerates missing sections gracefully.
   */
  loadFromSource(source: string): void {
    // Extract preamble (between \documentclass line and \begin{document})
    const preambleMatch = source.match(/\\documentclass[^\n]*\n([\s\S]*?)\\begin\{document\}/);
    if (preambleMatch) {
      this.preamble = preambleMatch[1].trim();
    }

    // Extract body (between \begin{document} and \end{document})
    const bodyMatch = source.match(/\\begin\{document\}([\s\S]*?)\\end\{document\}/);
    if (bodyMatch) {
      this.body = bodyMatch[1].trim();
    } else {
      // No \begin{document}: treat whole source as body
      this.body = source.trim();
    }
  }
}
