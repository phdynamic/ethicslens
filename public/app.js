/* ============================================================
   EthicsLens — Application Logic
   ============================================================ */

const API_URL = '/api/analyze';
const FETCH_TIMEOUT = 90000; // 90 seconds
const MAX_RETRIES = 1;

let mode = 'url';
const colors = ['warm', 'cool', 'rose', 'green', 'violet', 'amber'];

/* ---- Progress Bar ---- */

const PROGRESS_STAGES = [
  { pct: 12, text: 'Reading the situation...' },
  { pct: 25, text: 'Identifying ethical stakes...' },
  { pct: 38, text: 'Consulting Aristotle...' },
  { pct: 48, text: 'Weighing consequences with Mill...' },
  { pct: 58, text: 'Testing the categorical imperative...' },
  { pct: 68, text: 'Questioning values with Nietzsche...' },
  { pct: 76, text: 'Considering freedom with de Beauvoir...' },
  { pct: 84, text: 'Mapping the tensions...' },
  { pct: 90, text: 'Formulating questions for you...' },
  { pct: 94, text: 'Almost there...' },
];

let progressTimer = null;

function startProgress() {
  const fill = document.getElementById('progressFill');
  const text = document.getElementById('loadingText');
  fill.style.width = '0%';
  text.textContent = '';
  text.classList.remove('fading');

  let stageIndex = 0;

  function nextStage() {
    if (stageIndex >= PROGRESS_STAGES.length) return;
    const stage = PROGRESS_STAGES[stageIndex];

    text.classList.add('fading');
    setTimeout(() => {
      text.textContent = stage.text;
      text.classList.remove('fading');
    }, 300);

    fill.style.width = stage.pct + '%';
    stageIndex++;

    const delay = 1200 + stageIndex * 300 + Math.random() * 800;
    progressTimer = setTimeout(nextStage, delay);
  }

  nextStage();
}

function finishProgress() {
  clearTimeout(progressTimer);
  document.getElementById('progressFill').style.width = '100%';
}

/* ---- Input Mode ---- */

function setMode(m) {
  mode = m;
  document.querySelectorAll('.input-tab').forEach(function (t) {
    var isActive = t.dataset.mode === m;
    t.classList.toggle('active', isActive);
    t.setAttribute('aria-selected', String(isActive));
  });
  document.getElementById('urlInput').style.display =
    m === 'url' ? 'block' : 'none';
  document.getElementById('headlineInput').style.display =
    m === 'headline' ? 'block' : 'none';
}

function useExample(text) {
  setMode('headline');
  document.getElementById('headlineField').value = text;
  analyze();
}

/* ---- Errors ---- */

function showError(msg) {
  var el = document.getElementById('errorMsg');
  el.textContent = msg;
  el.classList.add('visible');
}

function hideError() {
  document.getElementById('errorMsg').classList.remove('visible');
}

/* ---- Fetch Helpers ---- */

function fetchWithTimeout(url, options, timeout) {
  timeout = timeout || FETCH_TIMEOUT;
  var controller = new AbortController();
  var timeoutId = setTimeout(function () {
    controller.abort();
  }, timeout);

  return fetch(url, Object.assign({}, options, { signal: controller.signal }))
    .then(function (response) {
      clearTimeout(timeoutId);
      return response;
    })
    .catch(function (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error('The analysis is taking too long. Please try again.');
      }
      throw err;
    });
}

async function fetchWithRetry(url, options) {
  var lastError;
  for (var attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fetchWithTimeout(url, options);
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES) {
        await new Promise(function (r) {
          setTimeout(r, 1000 * (attempt + 1));
        });
      }
    }
  }
  throw lastError;
}

/* ---- URL State / History ---- */

function updateUrlState(input, inputMode) {
  var params = new URLSearchParams();
  params.set('q', input);
  params.set('mode', inputMode);
  window.history.pushState(
    { input: input, mode: inputMode },
    '',
    '?' + params.toString(),
  );
}

function clearUrlState() {
  window.history.pushState({}, '', window.location.pathname);
}

function checkUrlState() {
  var params = new URLSearchParams(window.location.search);
  var q = params.get('q');
  var m = params.get('mode');
  if (q && m) {
    setMode(m);
    if (m === 'url') {
      document.getElementById('urlField').value = q;
    } else {
      document.getElementById('headlineField').value = q;
    }
    analyze();
  }
}

/* ---- Utilities ---- */

function esc(str) {
  if (!str) return '';
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function isSafeUrl(url) {
  try {
    var parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function announceToScreenReader(message) {
  var announcer = document.getElementById('srAnnouncer');
  if (announcer) {
    announcer.textContent = message;
  }
}

/* ---- Main Analysis ---- */

async function analyze() {
  var input =
    mode === 'url'
      ? document.getElementById('urlField').value.trim()
      : document.getElementById('headlineField').value.trim();

  if (!input) {
    showError('Please enter a URL or describe a situation.');
    return;
  }

  // Validate URL scheme
  if (mode === 'url') {
    try {
      var url = new URL(input);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        showError('Please enter a valid HTTP or HTTPS URL.');
        return;
      }
    } catch {
      showError('Please enter a valid URL.');
      return;
    }
  }

  hideError();
  document.getElementById('inputArea').style.display = 'none';
  document.getElementById('examplesSection').style.display = 'none';
  document.getElementById('loading').classList.add('visible');
  document.getElementById('results').classList.remove('visible');

  announceToScreenReader(
    'Analyzing ethical dimensions. This may take a moment.',
  );
  startProgress();

  try {
    var response = await fetchWithRetry(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: input, mode: mode }),
    });

    if (!response.ok) {
      var errData = await response.json().catch(function () {
        return {};
      });
      throw new Error(
        errData.error || 'Something went wrong. Please try again.',
      );
    }

    var result = await response.json();
    finishProgress();

    updateUrlState(input, mode);

    // Brief pause so users see 100% before results appear
    await new Promise(function (r) {
      setTimeout(r, 500);
    });

    renderResults(result);
    announceToScreenReader('Analysis complete. Results are now displayed.');

    // Move focus into results for keyboard users
    document.getElementById('results').focus();
  } catch (err) {
    console.error(err);
    finishProgress();
    showError(err.message || 'Something went wrong. Please try again.');
    document.getElementById('inputArea').style.display = 'block';
    document.getElementById('examplesSection').style.display = 'block';
  } finally {
    document.getElementById('loading').classList.remove('visible');
  }
}

/* ---- Render Results ---- */

function renderResults(data) {
  var container = document.getElementById('results');

  var frameworksHTML = data.frameworks
    .map(function (fw, i) {
      return (
        '<div class="framework-card" data-color="' +
        colors[i % colors.length] +
        '">' +
        '<div class="framework-thinker">' +
        esc(fw.thinker) +
        '</div>' +
        '<div class="framework-tradition">' +
        esc(fw.tradition) +
        '</div>' +
        '<div class="framework-analysis">' +
        esc(fw.analysis) +
        '</div>' +
        '<div class="framework-source">' +
        '<span class="source-icon">&#128214;</span> ' +
        esc(fw.source_text) +
        '</div>' +
        '</div>'
      );
    })
    .join('');

  var questionsHTML = data.questions
    .map(function (q, i) {
      return (
        '<div class="question-item">' +
        '<span class="question-number">' +
        String(i + 1).padStart(2, '0') +
        '</span>' +
        esc(q) +
        '</div>'
      );
    })
    .join('');

  // Sample arguments section
  var argumentsHTML = '';
  if (data.sample_arguments && data.sample_arguments.length > 0) {
    var argsCards = data.sample_arguments
      .map(function (arg, i) {
        return (
          '<div class="argument-card" data-color="' +
          colors[(i + 1) % colors.length] +
          '">' +
          '<div class="argument-position">' +
          esc(arg.position) +
          '</div>' +
          '<div class="argument-sides">' +
          '<div class="argument-for">' +
          '<div class="argument-stance-label">Supporting this position</div>' +
          '<div class="argument-text">' +
          esc(arg.support) +
          '</div>' +
          '</div>' +
          '<div class="argument-against">' +
          '<div class="argument-stance-label">Challenging this position</div>' +
          '<div class="argument-text">' +
          esc(arg.challenge) +
          '</div>' +
          '</div>' +
          '</div>' +
          '</div>'
        );
      })
      .join('');

    argumentsHTML =
      '<div class="arguments-section">' +
      '<div class="section-label">Sample Arguments</div>' +
      '<p class="arguments-intro">Here are a few positions a student might argue for or against, with example reasoning on each side.</p>' +
      '<div class="arguments-grid">' +
      argsCards +
      '</div>' +
      '</div>';
  }

  var sourceHTML = '';
  if (data.source) {
    var safeHref = isSafeUrl(data.source) ? esc(data.source) : '#';
    sourceHTML =
      '<div class="result-source">Source: <a href="' +
      safeHref +
      '" target="_blank" rel="noopener">' +
      esc(data.source) +
      '</a></div>';
  }

  container.innerHTML =
    '<div class="result-header">' +
    '<div class="result-headline">' +
    esc(data.headline) +
    '</div>' +
    sourceHTML +
    '</div>' +
    '<div class="section-label">Ethical Stakes</div>' +
    '<div class="stakes-text">' +
    esc(data.stakes) +
    '</div>' +
    '<div class="section-label">Philosophical Perspectives</div>' +
    '<div class="frameworks-grid">' +
    frameworksHTML +
    '</div>' +
    argumentsHTML +
    '<div class="tensions-section">' +
    '<div class="section-label">Where the Frameworks Disagree</div>' +
    '<div class="tension-text">' +
    esc(data.tensions) +
    '</div>' +
    '</div>' +
    '<div class="questions-section">' +
    '<div class="section-label">Questions for You</div>' +
    questionsHTML +
    '</div>' +
    '<div class="action-row">' +
    '<button class="action-btn export-btn" aria-label="Copy analysis to clipboard">Copy to Clipboard</button>' +
    '<button class="action-btn print-btn" aria-label="Print analysis">Print</button>' +
    '<button class="reset-btn">Analyze Something Else</button>' +
    '</div>';

  container.classList.add('visible');

  // Store data for export
  container._data = data;

  // Wire up action buttons
  container.querySelector('.export-btn').addEventListener('click', exportResults);
  container.querySelector('.print-btn').addEventListener('click', function () {
    window.print();
  });
  container.querySelector('.reset-btn').addEventListener('click', resetApp);
}

/* ---- Export ---- */

function exportResults() {
  var data = document.getElementById('results')._data;
  if (!data) return;

  var text = 'ETHICSLENS ANALYSIS\n' + '='.repeat(40) + '\n\n';
  text += data.headline + '\n';
  if (data.source) text += 'Source: ' + data.source + '\n';

  text += '\n--- ETHICAL STAKES ---\n' + data.stakes + '\n';

  text += '\n--- PHILOSOPHICAL PERSPECTIVES ---\n';
  data.frameworks.forEach(function (fw) {
    text += '\n' + fw.thinker + ' (' + fw.tradition + ')\n';
    text += fw.analysis + '\n';
    text += 'Source: ' + fw.source_text + '\n';
  });

  if (data.sample_arguments && data.sample_arguments.length > 0) {
    text += '\n--- SAMPLE ARGUMENTS ---\n';
    data.sample_arguments.forEach(function (arg) {
      text += '\nPosition: ' + arg.position + '\n';
      text += '  For: ' + arg.support + '\n';
      text += '  Against: ' + arg.challenge + '\n';
    });
  }

  text +=
    '\n--- WHERE THE FRAMEWORKS DISAGREE ---\n' + data.tensions + '\n';

  text += '\n--- QUESTIONS FOR YOU ---\n';
  data.questions.forEach(function (q, i) {
    text += (i + 1) + '. ' + q + '\n';
  });

  navigator.clipboard
    .writeText(text)
    .then(function () {
      var btn = document.querySelector('.export-btn');
      var original = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(function () {
        btn.textContent = original;
      }, 2000);
    })
    .catch(function () {
      showError(
        'Could not copy to clipboard. Try selecting the text manually.',
      );
    });
}

/* ---- Reset ---- */

function resetApp() {
  document.getElementById('results').classList.remove('visible');
  document.getElementById('results').innerHTML = '';
  document.getElementById('inputArea').style.display = 'block';
  document.getElementById('examplesSection').style.display = 'block';
  document.getElementById('urlField').value = '';
  document.getElementById('headlineField').value = '';
  clearUrlState();

  var activeField = mode === 'url' ? 'urlField' : 'headlineField';
  document.getElementById(activeField).focus();
}

/* ---- Event Listeners ---- */

document.addEventListener('DOMContentLoaded', function () {
  // Enter to submit on URL field
  document.getElementById('urlField').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') analyze();
  });

  // Ctrl/Cmd+Enter to submit on textarea
  document
    .getElementById('headlineField')
    .addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) analyze();
    });

  // Tab switching
  document.querySelectorAll('.input-tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      setMode(tab.dataset.mode);
    });
  });

  // Example chips
  document.querySelectorAll('.example-chip').forEach(function (chip) {
    chip.addEventListener('click', function () {
      useExample(chip.dataset.example);
    });
  });

  // Submit button
  document.getElementById('submitBtn').addEventListener('click', analyze);

  // Click to dismiss errors
  document.getElementById('errorMsg').addEventListener('click', hideError);

  // Browser back/forward
  window.addEventListener('popstate', function (e) {
    if (e.state && e.state.input) {
      mode = e.state.mode;
      if (mode === 'url') {
        document.getElementById('urlField').value = e.state.input;
      } else {
        document.getElementById('headlineField').value = e.state.input;
      }
      analyze();
    } else {
      resetApp();
    }
  });

  // Re-run analysis from URL params on initial load
  checkUrlState();
});
