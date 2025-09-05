// Core state
const state = {
  language: localStorage.getItem('lang') || 'en',
  difficulty: localStorage.getItem('diff') || 'beginner',
  grade: null,
  subject: null,
  questions: [],
  order: [],
  index: 0,
  streak: Number(localStorage.getItem('streak') || 0),
  selectedOptionId: null,
  locked: false,
  // Quiz state
  quizQuestions: [],
  currentQuizIndex: 0,
  timer: null,
  timeLeft: 30,
  totalQuestions: 10,
  correctAnswers: 0
};

// Set tracking system - prevents users from getting same set twice
const setTracker = {
  // Get completed sets for current subject/grade
  getCompletedSets(grade, subject) {
    const key = `${grade}_${subject}`;
    const stored = localStorage.getItem(`completedSets_${key}`);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  },
  
  // Mark a set as completed
  markSetCompleted(grade, subject, setNumber) {
    const key = `${grade}_${subject}`;
    const completedSets = this.getCompletedSets(grade, subject);
    completedSets.add(setNumber);
    localStorage.setItem(`completedSets_${key}`, JSON.stringify([...completedSets]));
  },
  
  // Get available sets for current subject/grade
  getAvailableSets(grade, subject, totalSets = 3) {
    const completedSets = this.getCompletedSets(grade, subject);
    const availableSets = [];
    
    for (let i = 1; i <= totalSets; i++) {
      if (!completedSets.has(i)) {
        availableSets.push(i);
      }
    }
    
    // If all sets are completed, reset and start fresh
    if (availableSets.length === 0) {
      this.resetCompletedSets(grade, subject);
      return [1, 2, 3]; // Return all sets
    }
    
    return availableSets;
  },
  
  // Reset completed sets for a subject/grade
  resetCompletedSets(grade, subject) {
    const key = `${grade}_${subject}`;
    localStorage.removeItem(`completedSets_${key}`);
  }
};

// Question tracking system - prevents repeats across users
const questionTracker = {
  usedQuestions: new Set(),
  
  // Mark a question as used
  markUsed(questionId) {
    this.usedQuestions.add(questionId);
    this.saveToStorage();
  },
  
  // Check if question is available
  isAvailable(questionId) {
    return !this.usedQuestions.has(questionId);
  },
  
  // Get available questions from a set
  getAvailableQuestions(questionSet) {
    return questionSet.filter(q => this.isAvailable(q.id));
  },
  
  // Reset all tracking (for testing)
  reset() {
    this.usedQuestions.clear();
    localStorage.removeItem('usedQuestions');
  },
  
  // Save to localStorage
  saveToStorage() {
    localStorage.setItem('usedQuestions', JSON.stringify([...this.usedQuestions]));
  },
  
  // Load from localStorage
  loadFromStorage() {
    const stored = localStorage.getItem('usedQuestions');
    if (stored) {
      this.usedQuestions = new Set(JSON.parse(stored));
    }
  }
};

const elements = {
  questionText: document.getElementById('question-text'),
  options: document.getElementById('options'),
  nextBtn: document.getElementById('next-btn'),
  counter: document.getElementById('counter'),
  streak: document.getElementById('streak'),
  toast: document.getElementById('toast'),
  langButtons: Array.from(document.querySelectorAll('[data-lang]')),
  // difficulty is now chosen from landing cards
  landing: document.getElementById('landing'),
  avatarSection: document.getElementById('avatar-select'),
  avatars: document.getElementById('avatars'),
  avatarContinue: document.getElementById('avatar-continue'),
  gradeSection: document.getElementById('grade-select'),
  grades: document.getElementById('grades'),
  gradeTitle: document.getElementById('grade-title'),
  subjectSection: document.getElementById('subject-select'),
  subjects: document.getElementById('subjects'),
  subjectTitle: document.getElementById('subject-title'),
  avatarTitle: document.getElementById('avatar-title'),
  questionCard: document.getElementById('question-card'),
  backBtn: document.getElementById('back-btn'),
  // Quiz elements
  progressFill: document.getElementById('progress-fill'),
  progressText: document.getElementById('progress-text'),
  timerCircle: document.getElementById('timer-circle'),
  timerText: document.getElementById('timer-text')
};

const TEXTS = {
  en: {
    back: '⟵ Back',
    avatarTitle: 'Choose your avatar',
    continue: 'Continue',
    levelTitle: 'Choose your level',
    gradeTitle: 'Choose your grade',
    subjectTitle: 'Choose your subject',
    subjects: { physics: 'Physics', chemistry: 'Chemistry', biology: 'Biology' },
    levels: {
      beginner: { title: 'Beginner', sub: 'Grade 6 • Grade 7 • Grade 8' },
      intermediate: { title: 'Intermediate', sub: 'Grade 9 • Grade 10' },
      advanced: { title: 'Advanced', sub: 'Grade 11 • Grade 12' }
    }
  },
  ta: {
    back: '⟵ பின்',
    avatarTitle: 'உங்கள் அவதாரத்தைத் தேர்வு செய்க',
    continue: 'தொடர்க',
    levelTitle: 'உங்கள் நிலையைத் தேர்வு செய்க',
    gradeTitle: 'உங்கள் வகுப்பைத் தேர்வு செய்க',
    subjectTitle: 'பாடத்தைத் தேர்வு செய்க',
    subjects: { physics: 'இயற்பியல்', chemistry: 'வேதியியல்', biology: 'உயிரியல்' },
    grades: {
      'Grade 6': 'வகுப்பு 6', 'Grade 7': 'வகுப்பு 7', 'Grade 8': 'வகுப்பு 8',
      'Grade 9': 'வகுப்பு 9', 'Grade 10': 'வகுப்பு 10', 'Grade 11': 'வகுப்பு 11', 'Grade 12': 'வகுப்பு 12'
    },
    levels: {
      beginner: { title: 'தொடக்க நிலை', sub: 'வகுப்பு 6 • வகுப்பு 7 • வகுப்பு 8' },
      intermediate: { title: 'இடைநிலை', sub: 'வகுப்பு 9 • வகுப்பு 10' },
      advanced: { title: 'மேம்பட்ட', sub: 'வகுப்பு 11 • வகுப்பு 12' }
    }
  }
};

async function loadQuestions(){
  try{
    const res = await fetch('questions.json');
    if(!res.ok) throw new Error('Failed to fetch questions.json');
    const all = await res.json();
    state.questions = Array.isArray(all) ? all : [];
    console.log('Questions loaded successfully:', state.questions.length);
  } catch(err){
    console.error('Error loading questions:', err);
    state.questions = [];
  }
}

function filterByDifficulty(){
  return state.questions.filter(q => q.difficulty === state.difficulty);
}

function buildOrder(){
  const filtered = filterByDifficulty();
  // Get only available (unused) questions
  const availableQuestions = questionTracker.getAvailableQuestions(filtered);
  
  if (availableQuestions.length === 0) {
    // No questions available - show message
    state.order = [];
    return;
  }
  
  state.order = availableQuestions.map((_, i) => i);
  shuffleArray(state.order);
  state.index = 0;
}

function currentQuestion(){
  const filtered = filterByDifficulty();
  const availableQuestions = questionTracker.getAvailableQuestions(filtered);
  return availableQuestions[state.order[state.index]];
}

function startQuiz(){
  console.log('Quiz start - State:', { difficulty: state.difficulty, grade: state.grade, subject: state.subject });
  console.log('Total questions loaded:', state.questions.length);
  
  // Get available sets for this grade/subject combination
  const availableSets = setTracker.getAvailableSets(state.grade, state.subject);
  
  if(availableSets.length === 0){
    alert('No available question sets. All sets have been completed.');
    return;
  }
  
  // Randomly select one of the available sets
  const selectedSet = availableSets[Math.floor(Math.random() * availableSets.length)];
  state.currentSet = selectedSet;
  
  console.log(`Selected set ${selectedSet} for ${state.grade} ${state.subject}`);
  
  // Filter questions by difficulty, grade, subject, and set
  // For advanced grades (11, 12), use 'advanced' difficulty
  const effectiveDifficulty = (state.grade === 'Grade 11' || state.grade === 'Grade 12') ? 'advanced' : state.difficulty;
  
  const filtered = state.questions.filter(q => 
    q.difficulty === effectiveDifficulty && 
    q.grade === state.grade &&
    q.subject === state.subject &&
    q.id.includes(`_set${selectedSet}_`)
  );
  
  console.log('Filtered questions:', filtered.length);
  
  // Check if we have questions
  if (filtered.length === 0) {
    alert(`No questions found for set ${selectedSet} of this combination.\nLooking for: difficulty="${state.difficulty}", grade="${state.grade}", subject="${state.subject}"\nTotal questions: ${state.questions.length}`);
    return;
  }
  
  // Select 10 random questions from the chosen set
  state.quizQuestions = shuffleArray([...filtered]).slice(0, state.totalQuestions);
  state.currentQuizIndex = 0;
  state.correctAnswers = 0;
  
  // Hide other sections and show quiz
  elements.landing && (elements.landing.hidden = true);
  elements.gradeSection && (elements.gradeSection.hidden = true);
  elements.subjectSection && (elements.subjectSection.hidden = true);
  elements.avatarSection && (elements.avatarSection.hidden = true);
  elements.questionCard.hidden = false;
  elements.backBtn.hidden = false;
  
  renderQuizQuestion();
}

function renderQuizQuestion(){
  if(state.currentQuizIndex >= state.quizQuestions.length){
    showQuizResults();
    return;
  }
  
  const q = state.quizQuestions[state.currentQuizIndex];
  
  // Update progress
  const progress = ((state.currentQuizIndex + 1) / state.totalQuestions) * 100;
  elements.progressFill.style.width = `${progress}%`;
  elements.progressText.textContent = `${state.currentQuizIndex + 1}/${state.totalQuestions}`;
  elements.counter.textContent = `${state.currentQuizIndex + 1} / ${state.totalQuestions}`;
  
  // Reset timer
  state.timeLeft = 30;
  startTimer();
  
  // Update question
  elements.questionText.innerHTML = `<div>${q.text.en}</div><div style="margin-top:6px;color:var(--muted);font-weight:600;">${q.text.ta}</div>`;
  elements.options.innerHTML = '';
  state.selectedOptionId = null;
  state.locked = false;
  elements.nextBtn.disabled = true;
  
  // Create options
  q.options.forEach((opt, idx) => {
    const btn = document.createElement('button');
    btn.className = 'option';
    btn.setAttribute('data-id', String(idx));
    btn.innerHTML = `<span class="badge">${String.fromCharCode(65+idx)}</span><span><div>${opt.en}</div><div style="margin-top:4px;color:var(--muted);font-weight:600;">(${opt.ta})</div></span>`;
    btn.addEventListener('click', () => onQuizSelect(idx));
    btn.addEventListener('touchstart', () => onQuizSelect(idx), {passive:true});
    elements.options.appendChild(btn);
  });
}

function startTimer(){
  if(state.timer) clearInterval(state.timer);
  elements.timerCircle.classList.remove('warning','danger');
  elements.timerText.textContent = state.timeLeft;
  
  state.timer = setInterval(() => {
    state.timeLeft--;
    elements.timerText.textContent = state.timeLeft;
    
    // Change timer color based on time left
    elements.timerCircle.classList.remove('warning', 'danger');
    if(state.timeLeft <= 10){
      elements.timerCircle.classList.add('danger');
    } else if(state.timeLeft <= 15){
      elements.timerCircle.classList.add('warning');
    }
    
    if(state.timeLeft <= 0){
      clearInterval(state.timer);
      // Auto-submit if time runs out
      if(!state.locked){
        onQuizSelect(-1); // -1 means no answer selected
      }
    }
  }, 1000);
}

function onQuizSelect(idx){
  if(state.locked) return;
  state.locked = true;
  clearInterval(state.timer);
  
  const q = state.quizQuestions[state.currentQuizIndex];
  const correct = idx === q.answerIndex;
  
  if(correct){
    state.correctAnswers++;
    state.streak += 1;
  } else {
    state.streak = 0;
  }
  
  // Show correct/incorrect answers
  const optionButtons = Array.from(elements.options.querySelectorAll('.option'));
  optionButtons.forEach((b, i) => {
    if(i === q.answerIndex){ b.classList.add('correct'); }
    if(i === idx && !correct){ b.classList.add('wrong'); }
  });
  
  elements.streak.textContent = `Streak: ${state.streak}`;
  elements.nextBtn.disabled = false;
  
  // Auto-advance after 2 seconds
  setTimeout(() => {
    nextQuizQuestion();
  }, 2000);
}

function nextQuizQuestion(){
  state.currentQuizIndex++;
  renderQuizQuestion();
}

function showQuizResults(){
  const percentage = Math.round((state.correctAnswers / state.totalQuestions) * 100);
  
  // Mark the current set as completed
  if(state.currentSet) {
    setTracker.markSetCompleted(state.grade, state.subject, state.currentSet);
    console.log(`Marked set ${state.currentSet} as completed for ${state.grade} ${state.subject}`);
  }
  
  const message = state.language === 'en' 
    ? `Quiz Complete! You scored ${state.correctAnswers}/${state.totalQuestions} (${percentage}%)`
    : `வினாடி வினா முடிந்தது! நீங்கள் ${state.correctAnswers}/${state.totalQuestions} (${percentage}%) பெற்றுள்ளீர்கள்`;
  
  elements.questionText.textContent = message;
  elements.options.innerHTML = '';
  elements.nextBtn.disabled = true;
  elements.progressFill.style.width = '100%';
  elements.timerCircle.style.display = 'none';
}

function renderQuestion(){
  elements.landing.hidden = true;
  elements.questionCard.hidden = false;
  elements.backBtn.hidden = false;
  // color accent on question card border based on difficulty
  const colorMap = { beginner: 'var(--beginner)', intermediate: 'var(--intermediate)', advanced: 'var(--advanced)' };
  elements.questionCard.style.borderColor = getComputedStyle(document.documentElement).getPropertyValue('--border');
  elements.questionCard.style.boxShadow = `0 10px 30px #00000010, inset 0 0 0 3px ${colorMap[state.difficulty] || 'transparent'}`;
  const q = currentQuestion();
  if(!q){
    showNoQuestionsMessage();
    return;
  }
  elements.counter.textContent = `${state.index+1} / ${state.order.length}`;
  elements.streak.textContent = `Streak: ${state.streak}`;
  elements.questionText.textContent = q.text[state.language];
  elements.options.innerHTML = '';
  state.selectedOptionId = null;
  state.locked = false;
  elements.nextBtn.disabled = true;
  q.options.forEach((opt, idx) => {
    const btn = document.createElement('button');
    btn.className = 'option';
    btn.setAttribute('data-id', String(idx));
    btn.innerHTML = `<span class="badge">${String.fromCharCode(65+idx)}</span><span>${opt[state.language]}</span>`;
    btn.addEventListener('click', () => onSelect(idx));
    btn.addEventListener('touchstart', () => onSelect(idx), {passive:true});
    elements.options.appendChild(btn);
  });
}

function showNoQuestionsMessage(){
  elements.questionText.textContent = state.language === 'en' 
    ? 'All questions for this level have been used. Please try a different level or reset the quiz.' 
    : 'இந்த நிலைக்கான அனைத்து கேள்விகளும் பயன்படுத்தப்பட்டுள்ளன. வேறு நிலையை முயற்சிக்கவும் அல்லது வினாடி வினாவை மீட்டமைக்கவும்.';
  elements.options.innerHTML = '';
  elements.nextBtn.disabled = true;
  elements.counter.textContent = '0 / 0';
}

function onSelect(idx){
  if(state.locked) return;
  state.locked = true;
  const q = currentQuestion();
  const correct = idx === q.answerIndex;
  
  // Mark this question as used to prevent repeats
  questionTracker.markUsed(q.id);
  
  const optionButtons = Array.from(elements.options.querySelectorAll('.option'));
  optionButtons.forEach((b, i) => {
    if(i === q.answerIndex){ b.classList.add('correct'); }
    if(i === idx && !correct){ b.classList.add('wrong'); }
  });
  if(correct){
    state.streak += 1;
    if(state.streak > 0 && state.streak % 3 === 0){
      showCongrats();
    }
  } else {
    state.streak = 0;
  }
  localStorage.setItem('streak', String(state.streak));
  elements.streak.textContent = `Streak: ${state.streak}`;
  elements.nextBtn.disabled = false;
}

function showCongrats(){
  const msgs = {
    en: 'Great job! 3 in a row! 🎉',
    ta: 'மிகச் சிறப்பு! 3 வெற்றி தொடர்ச்சி! 🎉'
  };
  elements.toast.innerHTML = `<div>${msgs[state.language]}</div>`;
  elements.toast.hidden = false;
  setTimeout(()=>{ elements.toast.hidden = true; }, 2000);
}

function nextQuestion(){
  if(state.index < state.order.length - 1){
    state.index += 1;
    renderQuestion();
    persistProgress();
  } else {
    elements.questionText.textContent = state.language==='en' ? 'You have reached the end.' : 'நீங்கள் முடிவை எட்டிவிட்டீர்கள்.';
    elements.options.innerHTML = '';
    elements.nextBtn.disabled = true;
  }
}

function shuffleArray(arr){
  for(let i=arr.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [arr[i],arr[j]] = [arr[j],arr[i]];
  }
}

function persistProgress(){
  localStorage.setItem('lang', state.language);
  localStorage.setItem('diff', state.difficulty);
}

function resetProgress(){
  state.streak = 0;
  localStorage.setItem('streak','0');
  elements.streak.textContent = `Streak: ${state.streak}`;
  // Reset question tracking to allow all questions again
  questionTracker.reset();
  buildOrder();
  renderQuestion();
}

function bindUI(){
  elements.langButtons.forEach(b => b.addEventListener('click', () => {
    state.language = b.dataset.lang;
    elements.langButtons.forEach(x=>x.classList.toggle('active', x===b));
    persistProgress();
    applyLanguage();
    if(!elements.avatarSection.hidden){
      showAvatarSelection();
    } else if(elements.subjectSection && !elements.subjectSection.hidden){
      showSubjectSelection();
    } else if(elements.gradeSection && !elements.gradeSection.hidden){
      showGradeSelection();
    } else if(elements.landing && !elements.landing.hidden){
      showLevelSelection();
    } else if(elements.questionCard && !elements.questionCard.hidden){
      renderQuestion();
    }
  }));
  // landing level cards
  document.querySelectorAll('[data-start]').forEach(card => {
    card.addEventListener('click', () => {
      state.difficulty = card.getAttribute('data-start');
      document.querySelectorAll('[data-start]').forEach(c=>c.classList.remove('selected'));
      card.classList.add('selected');
      showGradeSelection();
    });
  });
  elements.grades && elements.grades.addEventListener('click', (e)=>{
    const target = e.target.closest('[data-grade]');
    if(!target) return;
    state.grade = target.getAttribute('data-grade');
    showSubjectSelection();
  });
  elements.subjects && elements.subjects.addEventListener('click', (e)=>{
    const target = e.target.closest('[data-subject]');
    if(!target) return;
    const subject = target.getAttribute('data-subject');
    state.subject = subject;
    // Redirect to standalone quiz page with query params
    const params = new URLSearchParams({
      grade: state.grade || '',
      subject: state.subject || '',
      difficulty: state.difficulty || ''
    });
    window.location.href = `quiz.html?${params.toString()}`;
  });
  elements.nextBtn.addEventListener('click', nextQuestion);
  // Shuffle and Reset buttons removed from UI
  elements.backBtn.addEventListener('click', () => {
    // Sequential back: question -> grade -> level -> avatar
    if(!elements.questionCard.hidden){
      // From question back to grade selection
      elements.questionCard.hidden = true;
      if(elements.subjectSection && !elements.subjectSection.hidden){
        // if subjects visible, go back there
        elements.subjectSection.hidden = false;
      } else if(elements.gradeSection){
        elements.gradeSection.hidden = false;
      }
      elements.backBtn.hidden = false;
      return;
    }
    if(elements.subjectSection && !elements.subjectSection.hidden){
      // From subject back to grade
      elements.subjectSection.hidden = true;
      if(elements.gradeSection) elements.gradeSection.hidden = false;
      elements.backBtn.hidden = false;
      return;
    }
    if(elements.gradeSection && !elements.gradeSection.hidden){
      // From grade back to level selection
      showLevelSelection();
      elements.backBtn.hidden = false; // on level screen, show back
      return;
    }
    if(elements.landing && !elements.landing.hidden){
      // From level back to avatar selection
      showAvatarSelection();
      elements.backBtn.hidden = true; // on avatar screen, hide back
      return;
    }
  });
}

async function init(){
  bindUI();
  // Initialize question tracker
  questionTracker.loadFromStorage();
  // restore language toggle visual
  elements.langButtons.forEach(x=>x.classList.toggle('active', x.dataset.lang===state.language));
  await loadQuestions();
  applyLanguage();
  // Always show avatar selection first
  if(elements.avatarSection){
    showAvatarSelection();
  } else {
    // fallback: show level selection
    elements.landing.hidden = false;
  }
  elements.gradeSection && (elements.gradeSection.hidden = true);
  elements.subjectSection && (elements.subjectSection.hidden = true);
  if(elements.questionCard) elements.questionCard.hidden = true;
}

function showGradeSelection(){
  const diff = state.difficulty;
  const map = {
    beginner: ['Grade 6','Grade 7','Grade 8'],
    intermediate: ['Grade 9','Grade 10'],
    advanced: ['Grade 11','Grade 12']
  };
  const list = map[diff] || [];
  if(!elements.grades) return;
  elements.grades.innerHTML = list.map(g=>{
    const label = TEXTS[state.language].grades ? TEXTS[state.language].grades[g] || g : g;
    return `<button class="level-card" data-grade="${g}" data-start="${diff}"><div class=\"level-title\">${label}</div></button>`;
  }).join('');
  if(elements.gradeTitle) elements.gradeTitle.textContent = TEXTS[state.language].gradeTitle;
  elements.landing.hidden = true;
  if(elements.gradeSection) elements.gradeSection.hidden = false;
  if(elements.subjectSection) elements.subjectSection.hidden = true;
  elements.backBtn.hidden = false;
}

function showSubjectSelection(){
  if(!elements.subjects) return;
  elements.subjects.innerHTML = [
    { key: 'physics', label: TEXTS[state.language].subjects.physics },
    { key: 'chemistry', label: TEXTS[state.language].subjects.chemistry },
    { key: 'biology', label: TEXTS[state.language].subjects.biology }
  ].map(s=>`<button class="level-card" data-subject="${s.key}"><div class=\"level-title\">${s.label}</div></button>`).join('');
  if(elements.subjectTitle) elements.subjectTitle.textContent = TEXTS[state.language].subjectTitle;
  elements.gradeSection && (elements.gradeSection.hidden = true);
  elements.subjectSection && (elements.subjectSection.hidden = false);
  elements.backBtn.hidden = false;
}

function showLevelSelection(){
  if(!elements.landing) return;
  elements.landing.hidden = false;
  if(elements.gradeSection) elements.gradeSection.hidden = true;
  if(elements.avatarSection) elements.avatarSection.hidden = true;
  if(elements.questionCard) elements.questionCard.hidden = true;
}

function renderAvatars(){
  if(!elements.avatars) return;
  // Two avatars only: Boy and Girl. Place files in /avatars
  const avatarFiles = [
    { file: 'boy.png', label: 'Boy' },
    { file: 'girl.png', label: 'Girl' }
  ];
  // Do not preselect any avatar when showing the avatar screen
  elements.avatars.innerHTML = avatarFiles.map(({ file, label }) => {
    return `<button class="avatar-card" data-avatar="${file}">
      <img class="avatar-img" src="avatars/${file}" alt="${label} avatar">
    </button>`;
  }).join('');
  elements.avatars.addEventListener('click', onAvatarClick);
}

function onAvatarClick(e){
  const target = e.target.closest('[data-avatar]');
  if(!target) return;
  const name = target.getAttribute('data-avatar');
  localStorage.setItem('avatar', name);
  // toggle visual selection
  elements.avatars.querySelectorAll('.avatar-card').forEach(btn=>btn.classList.remove('selected'));
  target.classList.add('selected');
  // enable continue button
  if(elements.avatarContinue){
    elements.avatarContinue.disabled = false;
  }
}

function goToLevelFromAvatar(){
  if(elements.avatarSection) elements.avatarSection.hidden = true;
  showLevelSelection();
  elements.backBtn.hidden = false;
}

function showAvatarSelection(){
  renderAvatars();
  elements.avatarSection.hidden = false;
  elements.landing.hidden = true;
  elements.gradeSection && (elements.gradeSection.hidden = true);
  elements.questionCard.hidden = true;
  elements.backBtn.hidden = true;
  // localized labels
  applyLanguage();
  if(elements.avatarContinue){
    elements.avatarContinue.disabled = true;
    // remove previous listeners to avoid stale references
    const newBtn = elements.avatarContinue.cloneNode(true);
    elements.avatarContinue.parentNode.replaceChild(newBtn, elements.avatarContinue);
    elements.avatarContinue = newBtn;
    elements.avatarContinue.addEventListener('click', goToLevelFromAvatar);
  }
}

function applyLanguage(){
  if(elements.backBtn) elements.backBtn.textContent = TEXTS[state.language].back;
  if(elements.avatarTitle) elements.avatarTitle.textContent = TEXTS[state.language].avatarTitle;
  if(elements.avatarContinue) elements.avatarContinue.textContent = TEXTS[state.language].continue;
  // Landing title and level cards
  if(elements.landing){
    const titleEl = elements.landing.querySelector('.landing-title');
    if(titleEl) titleEl.textContent = TEXTS[state.language].levelTitle;
    const levels = TEXTS[state.language].levels;
    const container = elements.landing.querySelector('.levels');
    if(container){
      container.innerHTML = `
        <button class="level-card" data-start="beginner">
          <div class="level-title">${levels.beginner.title}</div>
          <div class="level-sub">${levels.beginner.sub}</div>
        </button>
        <button class="level-card" data-start="intermediate">
          <div class="level-title">${levels.intermediate.title}</div>
          <div class="level-sub">${levels.intermediate.sub}</div>
        </button>
        <button class="level-card" data-start="advanced">
          <div class="level-title">${levels.advanced.title}</div>
          <div class="level-sub">${levels.advanced.sub}</div>
        </button>`;
      // rebind level card clicks
      document.querySelectorAll('[data-start]').forEach(card => {
        card.addEventListener('click', () => {
          state.difficulty = card.getAttribute('data-start');
          document.querySelectorAll('[data-start]').forEach(c=>c.classList.remove('selected'));
          card.classList.add('selected');
          showGradeSelection();
        });
      });
    }
  }
}

init();