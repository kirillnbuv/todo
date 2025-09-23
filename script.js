// DOM elements
const input = document.getElementById('taskInput');
const tbody = document.getElementById('tbody');
const saveDiv = document.getElementById('saveDiv');
const getDiv = document.getElementById('getDiv');
const exportDiv = document.getElementById('exportDiv');
const importDiv = document.getElementById('importDiv');
const importFile = document.getElementById('importFile');
const autosaveToggle = document.getElementById('autosaveToggle');
const errorMessage = document.getElementById('errorMessage');

// Application state
let todos = [];
let unsavedChanges = false;
const STORAGE_KEY = 'todo-autosave-v1';

// Validation constants
const VALIDATION = {
  MIN_LENGTH: 1,
  MAX_LENGTH: 100,
  MAX_TASKS: 1000,
  ALLOWED_FILE_SIZE: 1024 * 1024, // 1MB
};

/**
 * Show error message to user
 * @param {string} message - Error message to display
 * @param {number} duration - How long to show message (ms)
 */
function showError(message, duration = 3000) {
  errorMessage.textContent = message;
  errorMessage.style.display = 'block';
  setTimeout(() => {
    errorMessage.style.display = 'none';
  }, duration);
}

/**
 * Enhanced text sanitization to prevent XSS and other security issues
 * @param {string} text - Text to sanitize
 * @returns {string} - Sanitized text
 */
function sanitizeText(text) {
  if (typeof text !== 'string') {
    return '';
  }

  // Basic cleanup and trimming
  text = text.trim();
  
  // Remove potentially dangerous HTML tags and attributes
  text = text
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '') // Remove style tags
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '') // Remove iframe
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '') // Remove object
    .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '') // Remove embed
    .replace(/<link\b[^>]*>/gi, '') // Remove link tags
    .replace(/<meta\b[^>]*>/gi, '') // Remove meta tags
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '') // Remove event handlers
    .replace(/javascript\s*:/gi, '') // Remove javascript: protocol
    .replace(/data\s*:/gi, '') // Remove data: protocol
    .replace(/vbscript\s*:/gi, '') // Remove vbscript: protocol
    .replace(/<[^>]*>/g, '') // Remove all HTML tags
    .replace(/[<>"'&]/g, match => {
      // Escape special characters
      const escapeMap = {
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
        '&': '&amp;'
      };
      return escapeMap[match];
    });

  // Remove multiple whitespaces
  text = text.replace(/\s+/g, ' ').trim();
  
  // Remove control characters (except normal spaces, tabs and newlines)
  text = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  return text;
}

/**
 * Validate task text
 * @param {string} text - Text to validate
 * @returns {Object} - Validation result
 */
function validateTask(text) {
  const sanitized = sanitizeText(text);
  
  if (!sanitized || sanitized.length < VALIDATION.MIN_LENGTH) {
    return { valid: false, error: 'Task cannot be empty or contain only special characters.' };
  }
  
  if (sanitized.length > VALIDATION.MAX_LENGTH) {
    return { valid: false, error: `Task must be ${VALIDATION.MAX_LENGTH} characters or less.` };
  }

  // Check for duplicates (case-insensitive)
  const isDuplicate = todos.some(todo => 
    todo.text.toLowerCase() === sanitized.toLowerCase()
  );
  
  if (isDuplicate) {
    return { valid: false, error: 'This task already exists!' };
  }

  // Check maximum number of tasks
  if (todos.length >= VALIDATION.MAX_TASKS) {
    return { valid: false, error: `Maximum ${VALIDATION.MAX_TASKS} tasks allowed.` };
  }

  return { valid: true, sanitized };
}

/**
 * Safe save to localStorage
 * @returns {boolean} - Success status
 */
function saveToLocal() {
  if (autosaveToggle.checked) {
    try {
      const dataString = JSON.stringify(todos);
      
      // Check data size
      if (dataString.length > 5 * 1024 * 1024) { // 5MB limit
        showError('Data too large to save automatically.');
        return false;
      }
      
      localStorage.setItem(STORAGE_KEY, dataString);
      unsavedChanges = false;
      return true;
    } catch (error) {
      showError('Failed to save data. Storage may be full.');
      return false;
    }
  }
  return true;
}

/**
 * Safe load from localStorage
 * @returns {Array} - Array of todos
 */
function loadFromLocal() {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    
    const parsed = JSON.parse(data);
    
    // Validate data structure
    if (!Array.isArray(parsed)) {
      throw new Error('Invalid data format');
    }
    
    // Sanitize loaded data
    return parsed
      .filter(item => item && typeof item === 'object')
      .map(item => ({
        text: sanitizeText(item.text || ''),
        done: Boolean(item.done)
      }))
      .filter(item => item.text.length > 0)
      .slice(0, VALIDATION.MAX_TASKS); // Limit quantity
      
  } catch (error) {
    showError('Failed to load saved data. Starting fresh.');
    return [];
  }
}

/**
 * Render tasks to the table
 * @param {Array} list - Array of tasks to render
 */
function render(list) {
  while (tbody.firstChild) tbody.removeChild(tbody.firstChild);
  const fragment = document.createDocumentFragment();
  
  if (!list.length) {
    const tr = document.createElement('tr');
    tr.className = 'empty';
    tr.innerHTML = '<td colspan="4">No tasks at the moment</td>';
    fragment.appendChild(tr);
  } else {
    list.forEach((item, idx) => {
      const tr = document.createElement('tr');

      const num = document.createElement('td');
      num.textContent = String(idx + 1);
      num.setAttribute("data-label", "No.");

      const title = document.createElement('td');
      title.textContent = item.text; // Text is already sanitized
      title.setAttribute("data-label", "Todo item");
      if (item.done) title.classList.add('done');

      const status = document.createElement('td');
      status.textContent = item.done ? 'Finished' : 'In progress';
      status.setAttribute("data-label", "Status");

      const actions = document.createElement('td');
      actions.className = 'actions';
      actions.setAttribute("data-label", "Actions");

      const delBtn = document.createElement('button');
      delBtn.className = 'btn danger';
      delBtn.type = 'button';
      delBtn.textContent = 'DELETE';
      delBtn.setAttribute('aria-label', `Delete task: ${item.text}`);
      delBtn.addEventListener('click', () => {
        todos.splice(idx, 1);
        unsavedChanges = true;
        saveToLocal();
        render(todos);
      });

      const finBtn = document.createElement('button');
      finBtn.className = 'btn success';
      finBtn.type = 'button';
      finBtn.textContent = 'FINISHED';
      finBtn.setAttribute('aria-label', item.done ? 'Mark as incomplete' : 'Mark as complete');
      finBtn.addEventListener('click', () => {
        todos[idx].done = !todos[idx].done;
        unsavedChanges = true;
        saveToLocal();
        render(todos);
      });

      actions.appendChild(delBtn);
      actions.appendChild(finBtn);

      tr.appendChild(num);
      tr.appendChild(title);
      tr.appendChild(status);
      tr.appendChild(actions);
      fragment.appendChild(tr);
    });
  }
  tbody.appendChild(fragment);
}

/**
 * Add new task
 */
function addTask() {
  const validation = validateTask(input.value);
  
  if (!validation.valid) {
    showError(validation.error);
    input.focus();
    return;
  }

  todos.push({ text: validation.sanitized, done: false });
  unsavedChanges = true;
  
  if (!saveToLocal()) {
    // If save failed, remove the added task
    todos.pop();
    return;
  }
  
  input.value = '';
  setTimeout(() => input.focus(), 0);
  render(todos);
}

/**
 * Load sample tasks
 */
function getTasks() {
  if (todos.length) return;
  todos = [
    { text: 'Buy groceries for next week', done: false },
    { text: 'Renew car insurance', done: false },
    { text: 'Sign up for online course', done: false }
  ];
  unsavedChanges = true;
  saveToLocal();
  render(todos);
}

/**
 * Export tasks to file
 */
function exportTasks() {
  try {
    const content = todos.map(t => `${t.done ? "[x]" : "[ ]"} ${t.text}`).join("\n");
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tasks_${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    unsavedChanges = false;
    showError('Tasks exported successfully!', 2000);
  } catch (error) {
    showError('Failed to export tasks.');
  }
}

/**
 * Import tasks from file
 * @param {Event} e - File input change event
 */
function importTasks(e) {
  const file = e.target.files[0];
  if (!file) return;

  // File validation
  if (file.size > VALIDATION.ALLOWED_FILE_SIZE) {
    showError('File too large. Maximum size is 1MB.');
    importFile.value = '';
    return;
  }

  if (!file.type.includes('text') && !file.name.endsWith('.txt')) {
    showError('Please select a valid text file (.txt).');
    importFile.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const content = ev.target.result;
      const lines = content.split(/\r?\n/).filter(line => line.trim());
      
      if (lines.length > VALIDATION.MAX_TASKS) {
        showError(`File contains too many tasks. Maximum ${VALIDATION.MAX_TASKS} allowed.`);
        return;
      }

      const newTodos = [];
      for (const line of lines) {
        const sanitizedLine = sanitizeText(line);
        if (!sanitizedLine) continue;
        
        const done = sanitizedLine.startsWith("[x]") || sanitizedLine.startsWith("[X]");
        let text = sanitizedLine.replace(/^\[[xX ]\]\s*/, "");
        text = sanitizeText(text);
        
        if (text && text.length <= VALIDATION.MAX_LENGTH) {
          newTodos.push({ text, done });
        }
      }

      if (newTodos.length === 0) {
        showError('No valid tasks found in the file.');
        return;
      }

      todos = newTodos;
      unsavedChanges = true;
      saveToLocal();
      render(todos);
      showError(`${newTodos.length} tasks imported successfully!`, 2000);
    } catch (error) {
      showError('Error processing file. Please check the file format.');
    }
  };
  
  reader.onerror = () => {
    showError('Error reading file. Please try again.');
  };
  
  reader.readAsText(file, 'UTF-8');
  importFile.value = '';
}

// Initialize autosave setting
if (localStorage.getItem('autosaveEnabled') === 'true') {
  autosaveToggle.checked = true;
  todos = loadFromLocal();
}

// Event listeners
saveDiv.addEventListener('click', addTask);
saveDiv.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    addTask();
  }
});

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addTask();
});

getDiv.addEventListener('click', getTasks);
getDiv.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    getTasks();
  }
});

exportDiv.addEventListener('click', exportTasks);

importDiv.addEventListener('click', () => {
  if (todos.length && !confirm('Importing will replace all current tasks. Continue?')) return;
  importFile.click();
});

importFile.addEventListener('change', importTasks);

autosaveToggle.addEventListener('change', () => {
  try {
    localStorage.setItem('autosaveEnabled', autosaveToggle.checked ? 'true' : 'false');
    if (autosaveToggle.checked) saveToLocal();
  } catch (error) {
    showError('Failed to update auto-save settings.');
  }
});

window.addEventListener('beforeunload', (e) => {
  if (!autosaveToggle.checked && unsavedChanges) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// Initial render
if (autosaveToggle.checked) todos = loadFromLocal();
render(todos);