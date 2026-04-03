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

    // Compile to DVI (faster than PDF for dvisvgm)
    await run('latex', ['-interaction=nonstopmode', '-halt-on-error', 'circuit.tex'], dir);

    // Convert DVI → SVG
    await run('dvisvgm', ['--no-fonts', '--exact', '--bbox=tight', 'circuit.dvi', '-o', 'circuit.svg'], dir);

    const svg = await readFile(join(dir, 'circuit.svg'), 'utf8');
    return { svg };
  } catch (err) {
    return { error: err.message };
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
