// Classic worker: the official standalone UMD distribution exposes self.mammoth.
importScripts('../../vendor/mammoth/mammoth.browser.min.js');
self.onmessage = async ({ data: { data, maxChars } }) => {
  try {
    // extractRawText uses the browser Files adapter, which rejects all external
    // file reads. It does not accept conversion options or produce document HTML.
    const result = await self.mammoth.extractRawText({ arrayBuffer: data });
    let text = result.value;
    const warnings = result.messages.map(message => String(message.message));
    if (text.length > maxChars) {
      let end = maxChars;
      if (/[\uD800-\uDBFF]/.test(text[end - 1]) && /[\uDC00-\uDFFF]/.test(text[end])) end--;
      text = text.slice(0, end); warnings.push('Partial extraction: only the first 100,000 characters are available.');
    }
    if (!text.trim()) throw Error('No readable DOCX text found.');
    self.postMessage({ text, warnings });
  } catch {
    self.postMessage({ error: 'DOCX could not be read. It may be corrupt, encrypted, or unsupported.' });
  }
};
