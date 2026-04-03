/**
 * LaTeX render server
 * POST /render  { latex: string }  → { svg: string } | { error: string }
 *
 * Compiles the submitted LaTeX snippet with pdflatex, converts to SVG with dvisvgm.
 * Requires: texlive-latex-base, texlive-latex-extra, texlive-science, dvisvgm
 */

import http from 'http';
import { execFile } from 'child_process';
import { mkdtemp, writeFile, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

const PORT = 3737;

const LATEX_WRAPPER = (body) => `\\documentclass[tikz,border=2pt]{standalone}
\\usepackage{circuitikz}
\\begin{document}
${body}
\\end{document}
`;

function run(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd, timeout: 15000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || stdout || err.message));
      else resolve(stdout);
    });
  });
}

async function renderLatex(latexBody) {
  const dir = await mkdtemp(join(tmpdir(), 'circuitikz-'));
  try {
    const texFile = join(dir, 'circuit.tex');
    await writeFile(texFile, LATEX_WRAPPER(latexBody), 'utf8');

    // pdflatex → PDF
    await run('pdflatex', ['-interaction=nonstopmode', '-halt-on-error', 'circuit.tex'], dir);

    // PDF → SVG (page 1)
    await run('pdf2svg', ['circuit.pdf', 'circuit.svg', '1'], dir);

    const svg = await readFile(join(dir, 'circuit.svg'), 'utf8');

    // Extract the transform matrix common to all path elements.
    // pdf2svg always emits: transform="matrix(1, 0, 0, -1, tx, ty)"
    // where (tx, ty) is the SVG position of the TikZ origin (0,0).
    const m = svg.match(/transform="matrix\(1,\s*0,\s*0,\s*-1,\s*([\d.+-]+),\s*([\d.+-]+)\)"/);
    const tx = m ? parseFloat(m[1]) : 0;
    const ty = m ? parseFloat(m[2]) : 0;

    return { svg, tx, ty };
  } catch (err) {
    // Include last lines of .log for useful diagnostics
    let detail = err.message;
    try {
      const log = await readFile(join(dir, 'circuit.log'), 'utf8');
      const lines = log.split('\n');
      const errorLines = lines.filter(l => l.startsWith('!') || l.includes('Error'));
      detail = errorLines.slice(0, 6).join('\n') || log.slice(-800);
    } catch {}
    return { error: detail };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204); res.end(); return;
  }

  if (req.method === 'POST' && req.url === '/render') {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const { latex } = JSON.parse(body);
      if (!latex || typeof latex !== 'string') throw new Error('missing latex field');
      const result = await renderLatex(latex);
      res.writeHead(result.error ? 422 : 200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  res.writeHead(404); res.end();
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`LaTeX render server listening on http://127.0.0.1:${PORT}`);
});
