/**
 * Renderer module - creates DOM elements for log entry visualization.
 */
import { normalizeContent, parseSSEResponse, formatTimestamp } from './parser.js';

/**
 * Get a short model label from full model name.
 */
export function modelLabel(model) {
  if (!model) return 'unknown';
  if (model.includes('haiku')) return 'haiku';
  if (model.includes('opus')) return 'opus';
  if (model.includes('sonnet')) return 'sonnet';
  return model.split('-').pop() || model;
}

/**
 * Get model badge CSS class.
 */
function modelBadgeClass(model) {
  if (!model) return '';
  if (model.includes('haiku')) return 'haiku';
  if (model.includes('opus')) return 'opus';
  if (model.includes('sonnet')) return 'sonnet';
  return '';
}

/**
 * Create a copy-to-clipboard button.
 */
function createCopyButton(text) {
  const btn = document.createElement('button');
  btn.className = 'copy-btn';
  btn.textContent = 'Copy';
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = 'Copied!';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.textContent = 'Copy';
        btn.classList.remove('copied');
      }, 1500);
    } catch {
      btn.textContent = 'Failed';
      setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
    }
  });
  return btn;
}

/**
 * Create a JSON view with copy button.
 */
function createJsonView(obj) {
  const container = document.createElement('div');
  container.className = 'json-view-container';

  const pre = document.createElement('div');
  pre.className = 'json-view';
  const text = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
  pre.textContent = text;

  container.appendChild(pre);
  container.appendChild(createCopyButton(text));
  return container;
}

/**
 * Escape HTML characters.
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Render text content with basic markdown code block handling.
 */
function renderTextContent(text) {
  const div = document.createElement('div');
  div.className = 'text-content';

  // Split on code blocks (```...```)
  const parts = text.split(/(```[\s\S]*?```)/g);

  for (const part of parts) {
    if (part.startsWith('```')) {
      const codeBlock = document.createElement('div');
      codeBlock.className = 'code-block';

      const content = part.slice(3, -3);
      const firstNewline = content.indexOf('\n');
      const lang = firstNewline > 0 ? content.slice(0, firstNewline).trim() : '';
      const code = firstNewline > 0 ? content.slice(firstNewline + 1) : content;

      const pre = document.createElement('pre');
      const codeEl = document.createElement('code');
      codeEl.textContent = code;
      if (lang) codeEl.dataset.lang = lang;
      pre.appendChild(codeEl);
      codeBlock.appendChild(pre);
      codeBlock.appendChild(createCopyButton(code));
      div.appendChild(codeBlock);
    } else if (part.trim()) {
      // Handle inline code
      const span = document.createElement('span');
      span.innerHTML = escapeHtml(part).replace(
        /`([^`]+)`/g,
        '<code class="inline-code">$1</code>'
      );
      div.appendChild(span);
    }
  }

  return div;
}

/**
 * Render text as formatted markdown with syntax coloring.
 * Handles: headings, code blocks (with language label), inline code,
 * bold, italic, links, blockquotes, horizontal rules, and lists.
 */
export function renderMarkdownContent(text) {
  const container = document.createElement('div');
  container.className = 'md-rendered';

  // Detect if it's JSON
  const trimmed = text.trim();
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      const parsed = JSON.parse(trimmed);
      const pre = document.createElement('pre');
      pre.className = 'md-code-block';
      const code = document.createElement('code');
      code.className = 'md-code lang-json';
      code.textContent = JSON.stringify(parsed, null, 2);
      pre.appendChild(code);
      container.appendChild(pre);
      return container;
    } catch { /* not JSON, continue with markdown */ }
  }

  // Split into code blocks and the rest
  const parts = text.split(/(```[\s\S]*?```)/g);

  for (const part of parts) {
    if (part.startsWith('```')) {
      // Fenced code block
      const content = part.slice(3, -3);
      const firstNewline = content.indexOf('\n');
      const lang = firstNewline > 0 ? content.slice(0, firstNewline).trim() : '';
      const code = firstNewline > 0 ? content.slice(firstNewline + 1) : content;

      const wrapper = document.createElement('div');
      wrapper.className = 'md-code-wrapper';

      if (lang) {
        const langLabel = document.createElement('span');
        langLabel.className = 'md-code-lang';
        langLabel.textContent = lang;
        wrapper.appendChild(langLabel);
      }

      const pre = document.createElement('pre');
      pre.className = 'md-code-block';
      const codeEl = document.createElement('code');
      codeEl.className = `md-code${lang ? ` lang-${lang}` : ''}`;
      codeEl.textContent = code;
      pre.appendChild(codeEl);
      wrapper.appendChild(pre);
      container.appendChild(wrapper);
    } else {
      // Process markdown lines
      const lines = part.split('\n');
      let i = 0;

      while (i < lines.length) {
        const line = lines[i];

        // Horizontal rule
        if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())) {
          container.appendChild(document.createElement('hr'));
          i++;
          continue;
        }

        // Headings
        const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
        if (headingMatch) {
          const level = headingMatch[1].length;
          const el = document.createElement(`h${level}`);
          el.className = 'md-heading';
          el.innerHTML = formatInlineMarkdown(headingMatch[2]);
          container.appendChild(el);
          i++;
          continue;
        }

        // Blockquote
        if (line.trimStart().startsWith('> ')) {
          const bq = document.createElement('blockquote');
          bq.className = 'md-blockquote';
          let bqLines = [];
          while (i < lines.length && lines[i].trimStart().startsWith('> ')) {
            bqLines.push(lines[i].trimStart().slice(2));
            i++;
          }
          bq.innerHTML = formatInlineMarkdown(bqLines.join('\n'));
          container.appendChild(bq);
          continue;
        }

        // Unordered list
        if (/^\s*[-*+]\s+/.test(line)) {
          const ul = document.createElement('ul');
          ul.className = 'md-list';
          while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
            const li = document.createElement('li');
            li.innerHTML = formatInlineMarkdown(lines[i].replace(/^\s*[-*+]\s+/, ''));
            ul.appendChild(li);
            i++;
          }
          container.appendChild(ul);
          continue;
        }

        // Ordered list
        if (/^\s*\d+[.)]\s+/.test(line)) {
          const ol = document.createElement('ol');
          ol.className = 'md-list';
          while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
            const li = document.createElement('li');
            li.innerHTML = formatInlineMarkdown(lines[i].replace(/^\s*\d+[.)]\s+/, ''));
            ol.appendChild(li);
            i++;
          }
          container.appendChild(ol);
          continue;
        }

        // Empty line = paragraph break
        if (line.trim() === '') {
          i++;
          continue;
        }

        // Regular paragraph
        const para = document.createElement('p');
        para.className = 'md-paragraph';
        let paraLines = [];
        while (i < lines.length && lines[i].trim() !== '' &&
               !lines[i].match(/^#{1,6}\s/) &&
               !/^\s*[-*+]\s+/.test(lines[i]) &&
               !/^\s*\d+[.)]\s+/.test(lines[i]) &&
               !lines[i].trimStart().startsWith('> ') &&
               !/^(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i].trim())) {
          paraLines.push(lines[i]);
          i++;
        }
        para.innerHTML = formatInlineMarkdown(paraLines.join('\n'));
        container.appendChild(para);
      }
    }
  }

  return container;
}

/**
 * Format inline markdown: bold, italic, inline code, links.
 */
function formatInlineMarkdown(text) {
  return escapeHtml(text)
    // Inline code (must come first to prevent inner formatting)
    .replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong class="md-bold">$1</strong>')
    .replace(/__(.+?)__/g, '<strong class="md-bold">$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em class="md-italic">$1</em>')
    .replace(/_(.+?)_/g, '<em class="md-italic">$1</em>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a class="md-link" href="$2" target="_blank">$1</a>')
    // Preserve newlines within paragraphs
    .replace(/\n/g, '<br>');
}

/**
 * Render a single content block.
 */
function renderContentBlock(block) {
  if (block.type === 'text') {
    return renderTextContent(block.text || '');
  }

  if (block.type === 'tool_use') {
    const div = document.createElement('div');
    div.className = 'tool-use-block';

    const header = document.createElement('div');
    header.className = 'tool-use-header';
    header.textContent = `Tool Call: ${block.name || 'unknown'}`;
    div.appendChild(header);

    if (block.input) {
      const details = document.createElement('details');
      details.className = 'collapsible';
      const summary = document.createElement('summary');
      summary.textContent = 'Input';
      const badge = document.createElement('span');
      badge.className = 'collapsible-badge';
      badge.textContent = typeof block.input === 'string'
        ? `${block.input.length} chars`
        : `${Object.keys(block.input).length} keys`;
      summary.appendChild(badge);
      details.appendChild(summary);

      const content = document.createElement('div');
      content.className = 'collapsible-content';
      content.appendChild(createJsonView(block.input));
      details.appendChild(content);
      div.appendChild(details);
    }

    return div;
  }

  if (block.type === 'tool_result') {
    const div = document.createElement('div');
    div.className = 'tool-result-block';

    const header = document.createElement('div');
    header.className = 'tool-result-header';
    header.textContent = `Tool Result${block.tool_use_id ? ` (${block.tool_use_id.substring(0, 8)}...)` : ''}`;
    div.appendChild(header);

    if (block.content) {
      const contentBlocks = normalizeContent(block.content);
      for (const cb of contentBlocks) {
        div.appendChild(renderContentBlock(cb));
      }
    }

    return div;
  }

  // Fallback: show raw JSON
  const div = document.createElement('div');
  div.className = 'content-block';
  div.appendChild(createJsonView(block));
  return div;
}

/**
 * Render the entry list sidebar items.
 */
export function renderEntryList(entries, container, onSelect) {
  container.innerHTML = '';

  entries.forEach((entry, i) => {
    const item = document.createElement('div');
    item.className = 'entry-item';
    item.dataset.index = i;

    const req = entry.anthropicRequest || {};
    const model = req.model || 'unknown';
    const time = entry.timestamp ? new Date(entry.timestamp) : null;
    const timeStr = time
      ? time.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      : 'N/A';

    const msgCount = req.messages?.length || 0;
    const toolCount = req.tools?.length || 0;

    item.innerHTML = `
      <div class="entry-item-header">
        <span class="entry-item-index">#${i + 1}</span>
        <span class="entry-item-time">${escapeHtml(timeStr)}</span>
      </div>
      <div class="entry-item-model">
        <span class="model-badge ${modelBadgeClass(model)}">${escapeHtml(modelLabel(model))}</span>
        <span style="font-size:12px;color:var(--text-secondary);margin-left:4px;">${escapeHtml(model)}</span>
      </div>
      <div class="entry-item-meta">
        <span>${msgCount} msg${msgCount !== 1 ? 's' : ''}</span>
        ${toolCount > 0 ? `<span>${toolCount} tools</span>` : ''}
        ${entry.streaming ? '<span>streaming</span>' : ''}
      </div>
    `;

    item.addEventListener('click', () => onSelect(i));
    container.appendChild(item);
  });
}

/**
 * Render the detail header for a selected entry.
 */
export function renderDetailHeader(entry, container) {
  const req = entry.anthropicRequest || {};
  container.innerHTML = '';

  const items = [
    { label: 'Model', value: req.model || 'N/A' },
    { label: 'Time', value: formatTimestamp(entry.timestamp) },
    { label: 'Streaming', value: entry.streaming ? 'Yes' : 'No' },
    { label: 'Max Tokens', value: req.max_tokens || 'N/A' },
    { label: 'Temperature', value: req.temperature ?? 'N/A' },
  ];

  for (const { label, value } of items) {
    const div = document.createElement('div');
    div.className = 'detail-header-item';
    div.innerHTML = `<span class="label">${escapeHtml(label)}</span> <span class="value">${escapeHtml(String(value))}</span>`;
    container.appendChild(div);
  }
}

/**
 * Render the Messages tab content.
 */
export function renderMessagesTab(entry) {
  const container = document.createElement('div');
  const messages = entry.anthropicRequest?.messages || [];

  if (messages.length === 0) {
    container.textContent = 'No messages in this entry.';
    return container;
  }

  for (const msg of messages) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${msg.role}`;

    const header = document.createElement('div');
    header.className = 'message-header';
    header.innerHTML = `<span>${escapeHtml(msg.role.toUpperCase())}</span>`;

    const body = document.createElement('div');
    body.className = 'message-body';

    const blocks = normalizeContent(msg.content);
    for (const block of blocks) {
      if (block.type === 'text' && msg.role === 'user') {
        // Render user messages with full markdown formatting + plain text toggle
        const rawText = block.text || '';
        const wrapper = document.createElement('div');
        wrapper.className = 'md-toggle-wrapper';

        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'md-toggle-btn';
        toggleBtn.textContent = 'Plain Text';
        toggleBtn.title = 'Toggle between formatted and plain text';

        const mdView = renderMarkdownContent(rawText);
        const plainView = document.createElement('pre');
        plainView.className = 'plain-text-view hidden';
        plainView.textContent = rawText;

        toggleBtn.addEventListener('click', () => {
          const showingPlain = !plainView.classList.contains('hidden');
          if (showingPlain) {
            plainView.classList.add('hidden');
            mdView.classList.remove('hidden');
            toggleBtn.textContent = 'Plain Text';
          } else {
            mdView.classList.add('hidden');
            plainView.classList.remove('hidden');
            toggleBtn.textContent = 'Formatted';
          }
        });

        wrapper.appendChild(toggleBtn);
        wrapper.appendChild(mdView);
        wrapper.appendChild(plainView);
        body.appendChild(wrapper);
      } else {
        body.appendChild(renderContentBlock(block));
      }
    }

    msgDiv.appendChild(header);
    msgDiv.appendChild(body);
    container.appendChild(msgDiv);
  }

  return container;
}

/**
 * Render the System Prompts tab content.
 */
export function renderSystemTab(entry) {
  const container = document.createElement('div');
  const system = entry.anthropicRequest?.system || [];

  if (system.length === 0) {
    container.textContent = 'No system prompts in this entry.';
    return container;
  }

  system.forEach((s, i) => {
    const details = document.createElement('details');
    details.className = 'collapsible';
    if (i === 0) details.open = true;

    const summary = document.createElement('summary');
    const text = s.text || s.content || JSON.stringify(s);
    const preview = text.substring(0, 80).replace(/\n/g, ' ');
    summary.textContent = `System Prompt #${i + 1}: ${preview}...`;

    const badge = document.createElement('span');
    badge.className = 'collapsible-badge';
    badge.textContent = `${text.length} chars`;
    summary.appendChild(badge);

    const content = document.createElement('div');
    content.className = 'collapsible-content';

    const wrapper = document.createElement('div');
    wrapper.className = 'md-toggle-wrapper';

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'md-toggle-btn';
    toggleBtn.textContent = 'Plain Text';
    toggleBtn.title = 'Toggle between formatted and plain text';

    const mdView = renderMarkdownContent(text);
    const plainView = document.createElement('pre');
    plainView.className = 'plain-text-view hidden';
    plainView.textContent = text;

    toggleBtn.addEventListener('click', () => {
      const showingPlain = !plainView.classList.contains('hidden');
      if (showingPlain) {
        plainView.classList.add('hidden');
        mdView.classList.remove('hidden');
        toggleBtn.textContent = 'Plain Text';
      } else {
        mdView.classList.add('hidden');
        plainView.classList.remove('hidden');
        toggleBtn.textContent = 'Formatted';
      }
    });

    wrapper.appendChild(toggleBtn);
    wrapper.appendChild(mdView);
    wrapper.appendChild(plainView);
    content.appendChild(wrapper);

    details.appendChild(summary);
    details.appendChild(content);
    container.appendChild(details);
  });

  return container;
}

/**
 * Render the Tools tab content.
 */
export function renderToolsTab(entry) {
  const container = document.createElement('div');
  const tools = entry.anthropicRequest?.tools || [];

  if (tools.length === 0) {
    container.textContent = 'No tools defined in this entry.';
    return container;
  }

  tools.forEach((tool) => {
    const details = document.createElement('details');
    details.className = 'tool-card';

    const summary = document.createElement('summary');
    summary.textContent = tool.name || 'unnamed';

    const content = document.createElement('div');
    content.className = 'tool-card-content';

    if (tool.description) {
      const desc = document.createElement('div');
      desc.style.marginBottom = '8px';
      desc.appendChild(renderTextContent(tool.description));
      content.appendChild(desc);
    }

    if (tool.input_schema) {
      const schemaDetails = document.createElement('details');
      schemaDetails.className = 'collapsible';
      const schemaSummary = document.createElement('summary');
      schemaSummary.textContent = 'Input Schema';
      schemaDetails.appendChild(schemaSummary);
      const schemaContent = document.createElement('div');
      schemaContent.className = 'collapsible-content';
      schemaContent.appendChild(createJsonView(tool.input_schema));
      schemaDetails.appendChild(schemaContent);
      content.appendChild(schemaDetails);
    }

    details.appendChild(summary);
    details.appendChild(content);
    container.appendChild(details);
  });

  return container;
}

/**
 * Render the Request Comparison tab.
 * @param {object} entry
 * @param {object} callbacks - { onSwitchTab, onShowContent }
 */
export function renderRequestTab(entry, callbacks = {}) {
  const container = document.createElement('div');

  const grid = document.createElement('div');
  grid.className = 'comparison-grid';

  // Anthropic Request
  const anthropicCol = document.createElement('div');
  anthropicCol.className = 'comparison-column';
  const anthropicTitle = document.createElement('h3');
  anthropicTitle.textContent = 'Anthropic Request';
  anthropicCol.appendChild(anthropicTitle);
  if (entry.anthropicRequest) {
    const summary = { ...entry.anthropicRequest };
    const anthropicLinks = [];

    summary.messages = (summary.messages || []).map((m, i) => {
      const blocks = normalizeContent(m.content);
      const fullText = blocks.map(b => b.text || JSON.stringify(b)).join('\n');
      const placeholder = `__LINK_MSG_${i}__`;
      anthropicLinks.push({
        placeholder,
        label: `[${fullText.length} chars]`,
        action: () => {
          if (callbacks.onShowContent) callbacks.onShowContent(`Message #${i + 1} (${m.role})`, fullText);
        },
      });
      return { role: m.role, content: placeholder, _index: i };
    });

    summary.system = (summary.system || []).map((s, i) => {
      const text = s.text || s.content || JSON.stringify(s);
      const placeholder = `__LINK_SYS_${i}__`;
      anthropicLinks.push({
        placeholder,
        label: `[${text.length} chars]`,
        action: () => {
          if (callbacks.onShowContent) callbacks.onShowContent(`System Prompt #${i + 1}`, text);
        },
      });
      return { type: s.type, text: placeholder, _index: i };
    });

    const toolCount = (summary.tools || []).length;
    const toolPlaceholder = `__LINK_TOOLS__`;
    anthropicLinks.push({
      placeholder: toolPlaceholder,
      label: `[${toolCount} tools]`,
      action: () => {
        if (callbacks.onSwitchTab) callbacks.onSwitchTab('tools');
      },
    });
    summary.tools = toolPlaceholder;

    anthropicCol.appendChild(createLinkedJsonView(summary, anthropicLinks));
  }

  // OpenAI Request
  const openaiCol = document.createElement('div');
  openaiCol.className = 'comparison-column';
  const openaiTitle = document.createElement('h3');
  openaiTitle.textContent = 'OpenAI Request';
  openaiCol.appendChild(openaiTitle);
  if (entry.openaiRequest) {
    const summary = { ...entry.openaiRequest };
    const openaiLinks = [];

    summary.messages = (summary.messages || []).map((m, i) => {
      const content = m.content || '';
      const placeholder = `__LINK_MSG_${i}__`;
      openaiLinks.push({
        placeholder,
        label: `[${content.length} chars]`,
        action: () => {
          if (callbacks.onShowContent) callbacks.onShowContent(`Message #${i + 1} (${m.role})`, content);
        },
      });
      return { role: m.role, content: placeholder, _index: i };
    });

    const toolCount = (summary.tools || []).length;
    const toolPlaceholder = `__LINK_TOOLS__`;
    openaiLinks.push({
      placeholder: toolPlaceholder,
      label: `[${toolCount} tools]`,
      action: () => {
        if (callbacks.onSwitchTab) callbacks.onSwitchTab('tools');
      },
    });
    summary.tools = toolPlaceholder;

    openaiCol.appendChild(createLinkedJsonView(summary, openaiLinks));
  }

  grid.appendChild(anthropicCol);
  grid.appendChild(openaiCol);
  container.appendChild(grid);

  return container;
}

/**
 * Create a JSON view with clickable links embedded inline.
 * @param {object} obj - The object to display as JSON
 * @param {Array} links - Array of { placeholder, label, action }
 */
function createLinkedJsonView(obj, links) {
  const container = document.createElement('div');
  container.className = 'json-view-container';

  const pre = document.createElement('div');
  pre.className = 'json-view';

  const jsonText = JSON.stringify(obj, null, 2);

  // Split the JSON text by placeholders and build DOM with links
  let remaining = jsonText;
  const fragment = document.createDocumentFragment();

  // Find all placeholder positions and sort by appearance order
  const occurrences = [];
  for (const link of links) {
    // Placeholder appears quoted in JSON: "__LINK_..."
    const quoted = `"${link.placeholder}"`;
    let startIdx = remaining.indexOf(quoted);
    if (startIdx === -1) {
      // Try without quotes (shouldn't happen but fallback)
      startIdx = remaining.indexOf(link.placeholder);
      if (startIdx !== -1) {
        occurrences.push({ idx: startIdx, len: link.placeholder.length, link });
      }
    } else {
      occurrences.push({ idx: startIdx, len: quoted.length, link });
    }
  }
  occurrences.sort((a, b) => a.idx - b.idx);

  let cursor = 0;
  for (const occ of occurrences) {
    // Add text before this link
    if (occ.idx > cursor) {
      const textNode = document.createTextNode(remaining.slice(cursor, occ.idx));
      fragment.appendChild(textNode);
    }

    // Add the clickable link
    const a = document.createElement('a');
    a.className = 'json-inline-link';
    a.href = '#';
    a.textContent = occ.link.label;
    a.addEventListener('click', (e) => {
      e.preventDefault();
      occ.link.action();
    });
    fragment.appendChild(a);

    cursor = occ.idx + occ.len;
  }

  // Add remaining text
  if (cursor < remaining.length) {
    fragment.appendChild(document.createTextNode(remaining.slice(cursor)));
  }

  pre.appendChild(fragment);
  container.appendChild(pre);
  container.appendChild(createCopyButton(jsonText));

  // Scroll to bottom after render
  requestAnimationFrame(() => {
    pre.scrollTop = pre.scrollHeight;
  });

  return container;
}

/**
 * Render the Response tab.
 */
export function renderResponseTab(entry) {
  const container = document.createElement('div');
  const parsed = parseSSEResponse(entry.copilotResponse);

  // Assembled content
  const contentSection = document.createElement('div');
  contentSection.className = 'response-content';
  const contentTitle = document.createElement('h3');
  contentTitle.textContent = 'Assembled Response';
  contentTitle.style.marginBottom = '8px';
  contentTitle.style.fontSize = '14px';
  contentSection.appendChild(contentTitle);

  if (parsed.content) {
    const wrapper = document.createElement('div');
    wrapper.className = 'md-toggle-wrapper';

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'md-toggle-btn';
    toggleBtn.textContent = 'Plain Text';
    toggleBtn.title = 'Toggle between formatted and plain text';

    const mdView = renderMarkdownContent(parsed.content);
    const plainView = document.createElement('pre');
    plainView.className = 'plain-text-view hidden';
    plainView.textContent = parsed.content;

    toggleBtn.addEventListener('click', () => {
      const showingPlain = !plainView.classList.contains('hidden');
      if (showingPlain) {
        plainView.classList.add('hidden');
        mdView.classList.remove('hidden');
        toggleBtn.textContent = 'Plain Text';
      } else {
        mdView.classList.add('hidden');
        plainView.classList.remove('hidden');
        toggleBtn.textContent = 'Formatted';
      }
    });

    wrapper.appendChild(toggleBtn);
    wrapper.appendChild(mdView);
    wrapper.appendChild(plainView);
    contentSection.appendChild(wrapper);
  } else {
    const empty = document.createElement('div');
    empty.style.color = 'var(--text-muted)';
    empty.textContent = 'No content extracted from response.';
    contentSection.appendChild(empty);
  }
  container.appendChild(contentSection);

  // Usage stats
  if (parsed.usage) {
    const usageTitle = document.createElement('h3');
    usageTitle.textContent = 'Usage Statistics';
    usageTitle.style.marginBottom = '8px';
    usageTitle.style.fontSize = '14px';
    container.appendChild(usageTitle);

    const statsGrid = document.createElement('div');
    statsGrid.className = 'usage-stats';

    const usageItems = [
      { label: 'Prompt Tokens', value: parsed.usage.prompt_tokens },
      { label: 'Completion Tokens', value: parsed.usage.completion_tokens },
      { label: 'Total Tokens', value: parsed.usage.total_tokens },
    ];

    if (parsed.usage.prompt_tokens_details?.cached_tokens != null) {
      usageItems.push({
        label: 'Cached Tokens',
        value: parsed.usage.prompt_tokens_details.cached_tokens,
      });
    }

    for (const { label, value } of usageItems) {
      if (value == null) continue;
      const stat = document.createElement('div');
      stat.className = 'usage-stat';
      stat.innerHTML = `<div class="label">${escapeHtml(label)}</div><div class="value">${Number(value).toLocaleString()}</div>`;
      statsGrid.appendChild(stat);
    }
    container.appendChild(statsGrid);
  }

  // Response model
  if (parsed.model) {
    const modelInfo = document.createElement('div');
    modelInfo.style.marginTop = '12px';
    modelInfo.style.fontSize = '13px';
    modelInfo.style.color = 'var(--text-secondary)';
    modelInfo.textContent = `Response Model: ${parsed.model}`;
    container.appendChild(modelInfo);
  }

  // Raw SSE (collapsible)
  if (entry.copilotResponse) {
    const rawDetails = document.createElement('details');
    rawDetails.className = 'collapsible';
    rawDetails.style.marginTop = '16px';
    const rawSummary = document.createElement('summary');
    rawSummary.textContent = 'Raw SSE Response';
    const badge = document.createElement('span');
    badge.className = 'collapsible-badge';
    badge.textContent = `${entry.copilotResponse.length} chars`;
    rawSummary.appendChild(badge);
    rawDetails.appendChild(rawSummary);

    const rawContent = document.createElement('div');
    rawContent.className = 'collapsible-content';
    rawContent.appendChild(createJsonView(entry.copilotResponse));
    rawDetails.appendChild(rawContent);
    container.appendChild(rawDetails);
  }

  return container;
}
