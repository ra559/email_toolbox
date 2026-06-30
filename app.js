'use strict';

/* ------------------------------------------------------------------ *
 * Tool 1: MIME Encoded-Word (RFC 2047) encoder / decoder
 * ------------------------------------------------------------------ */

// Matches a single encoded-word: =?charset?B|Q?text?=
const ENCODED_WORD_RE = /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g;

// Q-encode plain text into a =?UTF-8?Q?...?= encoded-word.
// Port of the reference Ruby implementation, with correct 2-digit hex.
function qEncode(text) {
  const bytes = new TextEncoder().encode(text);
  let out = '';
  for (const b of bytes) {
    if ((b >= 48 && b <= 57) || (b >= 65 && b <= 90) || (b >= 97 && b <= 122)) {
      out += String.fromCharCode(b); // keep alphanumerics raw
    } else if (b === 32) {
      out += '_'; // space -> underscore in Q-encoding
    } else {
      out += '=' + b.toString(16).toUpperCase().padStart(2, '0');
    }
  }
  return `=?UTF-8?Q?${out}?=`;
}

// Decode the body of a Q-encoded word into a byte array.
function qDecodeBytes(text) {
  const bytes = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '_') {
      bytes.push(0x20);
    } else if (c === '=') {
      const hex = text.substr(i + 1, 2);
      bytes.push(parseInt(hex, 16));
      i += 2;
    } else {
      bytes.push(c.charCodeAt(0));
    }
  }
  return new Uint8Array(bytes);
}

// Decode the body of a B-encoded (base64) word into a byte array.
function bDecodeBytes(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Decode a string that may contain one or more encoded-words.
// Whitespace separating adjacent encoded-words is dropped per RFC 2047.
function decodeEncodedWord(input) {
  return input.replace(
    /(=\?[^?]+\?[BbQq]\?[^?]*\?=)(\s+)(?==\?)/g,
    '$1'
  ).replace(ENCODED_WORD_RE, (match, charset, encoding, text) => {
    const enc = encoding.toUpperCase();
    const bytes = enc === 'B' ? bDecodeBytes(text) : qDecodeBytes(text);
    try {
      return new TextDecoder(charset).decode(bytes);
    } catch (e) {
      // Unknown charset label — fall back to UTF-8.
      return new TextDecoder('utf-8').decode(bytes);
    }
  });
}

function looksEncoded(input) {
  ENCODED_WORD_RE.lastIndex = 0;
  return ENCODED_WORD_RE.test(input);
}

/* ------------------------------------------------------------------ *
 * Tool 2: Base64 (UTF-8 safe)
 * ------------------------------------------------------------------ */

function base64Encode(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64Decode(text) {
  const binary = atob(text.replace(/\s+/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

// Heuristic: does this string look like base64?
function looksBase64(input) {
  const s = input.replace(/\s+/g, '');
  if (s.length === 0 || s.length % 4 !== 0) return false;
  return /^[A-Za-z0-9+/]+={0,2}$/.test(s);
}

/* ------------------------------------------------------------------ *
 * Wiring
 * ------------------------------------------------------------------ */

function $(id) {
  return document.getElementById(id);
}

function setMode(el, text, ok) {
  el.textContent = text;
  el.className = 'tag tool-mode ' + (ok === false ? 'is-danger is-light' : 'is-info is-light');
}

function copyToClipboard(textarea) {
  if (!textarea.value) return;
  navigator.clipboard.writeText(textarea.value).catch(() => {
    textarea.select();
    document.execCommand('copy');
  });
}

// ----- Encoded-Word tool -----
function runEncodedWord() {
  const input = $('ew-input').value;
  const out = $('ew-output');
  const mode = $('ew-mode');

  if (!input.trim()) {
    out.value = '';
    setMode(mode, 'Auto');
    return;
  }

  try {
    if (looksEncoded(input)) {
      out.value = decodeEncodedWord(input);
      setMode(mode, 'Decoded');
    } else {
      out.value = qEncode(input);
      setMode(mode, 'Encoded');
    }
  } catch (e) {
    out.value = 'Error: ' + e.message;
    setMode(mode, 'Error', false);
  }
}

// ----- Base64 tool -----
function runBase64() {
  const input = $('b64-input').value;
  const out = $('b64-output');
  const mode = $('b64-mode');
  const direction = $('b64-direction').value;

  if (!input.trim()) {
    out.value = '';
    setMode(mode, 'Auto');
    return;
  }

  try {
    let decode;
    if (direction === 'encode') decode = false;
    else if (direction === 'decode') decode = true;
    else decode = looksBase64(input);

    if (decode) {
      out.value = base64Decode(input);
      setMode(mode, 'Decoded');
    } else {
      out.value = base64Encode(input);
      setMode(mode, 'Encoded');
    }
  } catch (e) {
    out.value = 'Error: ' + e.message;
    setMode(mode, 'Error', false);
  }
}

// ----- Theme toggle (matches loremgen) -----
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  $('themeBtn').textContent = theme === 'dark' ? '☀ Theme' : '🌙 Theme';
}

document.addEventListener('DOMContentLoaded', () => {
  // Theme
  applyTheme(localStorage.getItem('theme') || 'light');
  $('themeBtn').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });

  // Encoded-Word
  $('ew-convert').addEventListener('click', runEncodedWord);
  $('ew-input').addEventListener('input', runEncodedWord);
  $('ew-copy').addEventListener('click', () => copyToClipboard($('ew-output')));
  $('ew-clear').addEventListener('click', () => {
    $('ew-input').value = '';
    runEncodedWord();
  });

  // Base64
  $('b64-convert').addEventListener('click', runBase64);
  $('b64-input').addEventListener('input', runBase64);
  $('b64-direction').addEventListener('change', runBase64);
  $('b64-copy').addEventListener('click', () => copyToClipboard($('b64-output')));
  $('b64-clear').addEventListener('click', () => {
    $('b64-input').value = '';
    runBase64();
  });
});
