// Core state
const state = {
  language: 'en',
  difficulty: localStorage.getItem('diff') || 'beginner',
  grade: null,
  subject: null,
  questions: [],
  order: [],
  index: 0,
  selectedOptionId: null,
  locked: false,
  streak: parseInt(localStorage.getItem('streak')) || 0,
  // Quiz state
  quizQuestions: [],
  currentQuizIndex: 0,
  timer: null,
  timeLeft: 30,
  totalQuestions: 10,
  correctAnswers: 0
};

// Multi-user set tracking system - ensures different users get different sets
const setTracker = {
  // Generate unique user session ID
  getUserSessionId() {
    let sessionId = sessionStorage.getItem('userSessionId');
    if (!sessionId) {
      sessionId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      sessionStorage.setItem('userSessionId', sessionId);
    }
    return sessionId;
  },
  
  // Get completed sets for current user and subject/grade
  getCompletedSets(grade, subject) {
    const sessionId = this.getUserSessionId();
    const key = `${sessionId}_${grade}_${subject}`;
    const stored = localStorage.getItem(`completedSets_${key}`);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  },
  
  // Get currently active sets (being used by other users)
  getActiveSets(grade, subject) {
    const key = `activeSets_${grade}_${subject}`;
    const stored = localStorage.getItem(key);
    const activeSets = stored ? JSON.parse(stored) : {};
    
    // Clean up expired sessions (older than 30 minutes)
    const now = Date.now();
    const cleanedActiveSets = {};
    for (const [sessionId, data] of Object.entries(activeSets)) {
      if (now - data.timestamp < 30 * 60 * 1000) { // 30 minutes
        cleanedActiveSets[sessionId] = data;
      }
    }
    
    // Save cleaned data back
    localStorage.setItem(key, JSON.stringify(cleanedActiveSets));
    return cleanedActiveSets;
  },
  
  // Mark a set as currently being used
  markSetActive(grade, subject, setNumber) {
    const sessionId = this.getUserSessionId();
    const key = `activeSets_${grade}_${subject}`;
    const activeSets = this.getActiveSets(grade, subject);
    
    activeSets[sessionId] = {
      setNumber: setNumber,
      timestamp: Date.now()
    };
    
    localStorage.setItem(key, JSON.stringify(activeSets));
    console.log(`Session ${sessionId} is now using set ${setNumber}`);
  },
  
  // Release a set when quiz is completed or abandoned
  releaseSet(grade, subject) {
    const sessionId = this.getUserSessionId();
    const key = `activeSets_${grade}_${subject}`;
    const activeSets = this.getActiveSets(grade, subject);
    
    if (activeSets[sessionId]) {
      delete activeSets[sessionId];
      localStorage.setItem(key, JSON.stringify(activeSets));
      console.log(`Session ${sessionId} released their set`);
    }
  },
  
  // Mark a set as completed for current user
  markSetCompleted(grade, subject, setNumber) {
    const sessionId = this.getUserSessionId();
    const key = `${sessionId}_${grade}_${subject}`;
    const completedSets = this.getCompletedSets(grade, subject);
    completedSets.add(setNumber);
    localStorage.setItem(key, JSON.stringify([...completedSets]));
    
    // Release the set from active usage
    this.releaseSet(grade, subject);
  },
  
  // Get available sets for current user, avoiding conflicts with other users
  getAvailableSets(grade, subject, totalSets = 3) {
    const completedSets = this.getCompletedSets(grade, subject);
    const activeSets = this.getActiveSets(grade, subject);
    const sessionId = this.getUserSessionId();
    
    // Get sets currently being used by other users
    const usedByOthers = new Set();
    for (const [otherSessionId, data] of Object.entries(activeSets)) {
      if (otherSessionId !== sessionId) {
        usedByOthers.add(data.setNumber);
      }
    }
    
    const availableSets = [];
    
    // Find sets that are not completed by this user and not being used by others
    for (let i = 1; i <= totalSets; i++) {
      if (!completedSets.has(i) && !usedByOthers.has(i)) {
        availableSets.push(i);
      }
    }
    
    console.log('Set availability:', {
      completed: [...completedSets],
      usedByOthers: [...usedByOthers],
      available: availableSets
    });
    
    // If no sets are available (all completed or in use), reset completed sets
    if (availableSets.length === 0) {
      // Check if all sets are just being used by others
      const allCompleted = completedSets.size === totalSets;
      if (allCompleted) {
        this.resetCompletedSets(grade, subject);
        // Recalculate available sets after reset
        const resetAvailable = [];
        for (let i = 1; i <= totalSets; i++) {
          if (!usedByOthers.has(i)) {
            resetAvailable.push(i);
          }
        }
        return resetAvailable.length > 0 ? resetAvailable : [1]; // Fallback to set 1
      }
      
      // If sets are just being used by others, wait or use any available
      return [1, 2, 3].filter(set => !usedByOthers.has(set));
    }
    
    return availableSets;
  },
  
  // Reset completed sets for current user
  resetCompletedSets(grade, subject) {
    const sessionId = this.getUserSessionId();
    const key = `${sessionId}_${grade}_${subject}`;
    localStorage.removeItem(key);
  },
  
  // Clean up when user leaves (call on page unload)
  cleanup(grade, subject) {
    this.releaseSet(grade, subject);
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
  langButtons: document.querySelectorAll('[data-lang]'),
  backBtn: document.getElementById('back-btn'),
  welcome: document.getElementById('welcome'),
  beginBtn: document.getElementById('begin-btn'),
  landing: document.getElementById('landing'),
  questionCard: document.getElementById('question-card'),
  questionText: document.getElementById('question-text'),
  options: document.getElementById('options'),
  nextBtn: document.getElementById('next-btn'),
  counter: document.getElementById('counter'),
  streak: document.getElementById('streak'),
  toast: document.getElementById('toast'),
  avatarSection: document.getElementById('avatar-select'),
  avatars: document.getElementById('avatars'),
  avatarTitle: document.getElementById('avatar-title'),
  // avatarContinue: document.getElementById('avatar-continue'), // Removed continue button
  gradeSection: document.getElementById('grade-select'),
  grades: document.getElementById('grades'),
  gradeTitle: document.getElementById('grade-title'),
  subjectSection: document.getElementById('subject-select'),
  subjects: document.getElementById('subjects'),
  subjectTitle: document.getElementById('subject-title'),
  // Quiz elements
  progressFill: document.getElementById('progress-fill'),
  progressText: document.getElementById('progress-text'),
  timerCircle: document.getElementById('timer-circle'),
  timerText: document.getElementById('timer-text'),
  // Welcome page elements
  welcomeTitle: document.getElementById('welcome-title'),
  welcomeSub: document.getElementById('welcome-sub'),
  featureLevelsTitle: document.getElementById('feature-levels-title'),
  featureLevelsDesc: document.getElementById('feature-levels-desc'),
  featureBadgesTitle: document.getElementById('feature-badges-title'),
  featureBadgesDesc: document.getElementById('feature-badges-desc'),
  featureBilingualTitle: document.getElementById('feature-bilingual-title'),
  featureBilingualDesc: document.getElementById('feature-bilingual-desc')
};

const TEXTS = {
  en: {
    back: '⟵ Back',
    avatarTitle: 'Choose your avatar',
    continue: 'Continue',
    levelTitle: 'Choose your level',
    gradeTitle: 'Choose your grade',
    subjectTitle: 'Choose your subject',
    welcome: {
      title: 'Arivoli',
      subtitle: 'MCQs for Young Minds — Explore science and level up as you learn!',
      beginBtn: "Let's Begin ",
      featureLevels: {
        title: 'Three Levels',
        desc: 'Beginner, Intermediate, Advanced'
      },
      featureBadges: {
        title: 'Science Fields',
        desc: 'Physics, Chemistry, Biology'
      },
      featureBilingual: {
        title: 'Bilingual',
        desc: 'Available in English and Tamil'
      }
    },
    levels: {
      beginner: { title: 'Beginner', sub: 'Grade 6 • Grade 7 • Grade 8' },
      intermediate: { title: 'Intermediate', sub: 'Grade 9 • Grade 10' },
      advanced: { title: 'Advanced', sub: 'Grade 11 • Grade 12' }
    },
    grades: {
      'Grade 6': 'Grade 6', 'Grade 7': 'Grade 7', 'Grade 8': 'Grade 8',
      'Grade 9': 'Grade 9', 'Grade 10': 'Grade 10',
      'Grade 11': 'Grade 11', 'Grade 12': 'Grade 12'
    },
    subjects: {
      physics: 'Physics',
      chemistry: 'Chemistry',
      biology: 'Biology'
    }
  },
  ta: {
    back: '⟵ பின்',
    avatarTitle: 'உங்கள் தோற்றத்தைத் தேர்வு செய்யுங்கள்',
    continue: 'தொடரவும்',
    levelTitle: 'உங்கள் நிலையை தேர்வு செய்யுங்கள்',
    gradeTitle: 'உங்கள் வகுப்பை தேர்வு செய்யுங்கள்',
    subjectTitle: 'உங்கள் பாடத்தை தேர்வு செய்யுங்கள்',
    welcome: {
      title: 'அறிவொளி',
      subtitle: 'அறிவியலை நுட்பமாக கற்றுக்கொள்ள வினாடி வினா!',
      beginBtn: 'தொடங்குவோம் ',
      featureLevels: {
        title: 'மூன்று நிலைகள்',
        desc: 'தொடக்க நிலை, இடைநிலை, மேல்நிலை'
      },
      featureBadges: {
        title: 'அறிவியல் துறைகள்',
        desc: 'இயற்பியல், வேதியியல், உயிரியல்'
      },
      featureBilingual: {
        title: 'இருமொழி',
        desc: 'ஆங்கிலம் மற்றும் தமிழில் கிடைக்கிறது'
      }
    },
    levels: {
      beginner: { title: 'தொடக்க நிலை', sub: 'வகுப்பு 6 • வகுப்பு 7 • வகுப்பு 8' },
      intermediate: { title: 'இடைநிலை', sub: 'வகுப்பு 9 • வகுப்பு 10' },
      advanced: { title: 'மேல்நிலை', sub: 'வகுப்பு 11 • வகுப்பு 12' }
    },
    grades: {
      'Grade 6': 'வகுப்பு 6', 'Grade 7': 'வகுப்பு 7', 'Grade 8': 'வகுப்பு 8',
      'Grade 9': 'வகுப்பு 9', 'Grade 10': 'வகுப்பு 10',
      'Grade 11': 'வகுப்பு 11', 'Grade 12': 'வகுப்பு 12'
    },
    subjects: {
      physics: 'இயற்பியல்',
      chemistry: 'வேதியியல்',
      biology: 'உயிரியல்'
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
    alert('No available question sets. All sets are currently being used by other users or completed. Please try again in a moment.');
    return;
  }
  
  // Randomly select one of the available sets
  const selectedSet = availableSets[Math.floor(Math.random() * availableSets.length)];
  state.currentSet = selectedSet;
  
  // Mark this set as active for this user session
  setTracker.markSetActive(state.grade, state.subject, selectedSet);
  
  console.log(`Selected set ${selectedSet} for ${state.grade} ${state.subject}`);
  
  // Filter questions by grade, subject, and set
  // Use flexible difficulty matching to handle mixed difficulty levels in question sets
  const filtered = state.questions.filter(q => 
    q.grade === state.grade &&
    q.subject.toLowerCase() === state.subject.toLowerCase() &&
    q.id.includes(`_set${selectedSet}_`)
  );
  
  console.log(`Found ${filtered.length} questions for ${state.grade} ${state.subject} set ${selectedSet}`);
  
  console.log('Filtered questions:', filtered.length);
  
  // Check if we have questions
  if (filtered.length === 0) {
    console.error(`No questions found for: grade="${state.grade}", subject="${state.subject}", set=${selectedSet}`);
    console.log('Total questions loaded:', state.questions.length);
    console.log('Sample question IDs:', state.questions.slice(0, 5).map(q => q.id));
    alert(`No questions found for set ${selectedSet} of this combination.\nLooking for: grade="${state.grade}", subject="${state.subject}"\nTotal questions: ${state.questions.length}`);
    return;
  }
  
  // Ensure we have enough questions, adjust total if needed
  if (filtered.length < state.totalQuestions) {
    console.warn(`Only ${filtered.length} questions available for this set, adjusting total`);
    state.totalQuestions = Math.min(filtered.length, 10);
  }
  
  // Select questions from the chosen set
  state.quizQuestions = shuffleArray([...filtered]).slice(0, state.totalQuestions);
  console.log(`Selected ${state.quizQuestions.length} questions for quiz`);
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
  console.log(`Rendering question ${state.currentQuizIndex + 1} of ${state.quizQuestions.length}`);
  
  if(state.currentQuizIndex >= state.quizQuestions.length){
    showQuizResults();
    return;
  }
  
  if(!state.quizQuestions[state.currentQuizIndex]) {
    console.error('Question not found at index:', state.currentQuizIndex);
    showQuizResults();
    return;
  }
  
  const q = state.quizQuestions[state.currentQuizIndex];
  
  // Update progress
  const progress = ((state.currentQuizIndex + 1) / state.totalQuestions) * 100;
  elements.progressFill.style.width = `${progress}%`;
  elements.progressText.textContent = `${state.currentQuizIndex + 1}/${state.totalQuestions}`;
  elements.counter.textContent = `${state.currentQuizIndex + 1} / ${state.totalQuestions}`;
  
  // Update streak display
  if(elements.streak) elements.streak.textContent = `Streak: ${state.streak}`;
  
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
    state.streak++;
    localStorage.setItem('streak', state.streak.toString());
    showCongrats();
  } else {
    state.streak = 0;
    localStorage.setItem('streak', '0');
  }
  
  // Show correct/incorrect answers
  const optionButtons = Array.from(elements.options.querySelectorAll('.option'));
  optionButtons.forEach((b, i) => {
    if(i === q.answerIndex){ b.classList.add('correct'); }
    if(i === idx && !correct){ b.classList.add('wrong'); }
  });
  
  // Update streak display
  if(elements.streak) elements.streak.textContent = `Streak: ${state.streak}`;
  
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
  console.log(`Quiz completed: ${state.correctAnswers}/${state.totalQuestions} questions answered`);
  
  const percentage = Math.round((state.correctAnswers / state.totalQuestions) * 100);
  
  // Mark the current set as completed
  if(state.currentSet) {
    setTracker.markSetCompleted(state.grade, state.subject, state.currentSet);
    console.log(`Marked set ${state.currentSet} as completed for ${state.grade} ${state.subject}`);
  }
  
  // Clear any running timer
  if(state.timer) {
    clearInterval(state.timer);
  }
  
  const message = state.language === 'en' 
    ? `Quiz Complete! You scored ${state.correctAnswers}/${state.totalQuestions} (${percentage}%)`
    : `வினாடி வினா முடிந்தது! நீங்கள் ${state.correctAnswers}/${state.totalQuestions} (${percentage}%) பெற்றுள்ளீர்கள்`;
  
  elements.questionText.innerHTML = `
    <div style="text-align: center;">
      <h2>${message}</h2>
      <button onclick="location.reload()" class="primary" style="margin-top: 20px;">Take Another Quiz</button>
    </div>
  `;
  elements.options.innerHTML = '';
  elements.nextBtn.disabled = true;
  elements.progressFill.style.width = '100%';
  elements.timerCircle.style.display = 'none';
  elements.counter.textContent = `${state.totalQuestions} / ${state.totalQuestions}`;
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

function onSelect(idx) {
  if (state.locked) return;
  state.locked = true;
  const q = currentQuestion();
  const correct = idx === q.answerIndex;

  // Mark this question as used to prevent repeats
  questionTracker.markUsed(q.id);

  const optionButtons = Array.from(elements.options.querySelectorAll('.option'));
  optionButtons.forEach((b, i) => {
    if (i === q.answerIndex) { b.classList.add('correct'); }
    if (i === idx && !correct) { b.classList.add('wrong'); }
  });

  if (correct) {
    // Increment streak for correct answer
    state.streak++;
    localStorage.setItem('streak', state.streak.toString());

    // Show congratulations message only for streaks of 2 or more
    showCongrats();  
  } else {
    // Reset streak for incorrect answer
    state.streak = 0;
    localStorage.setItem('streak', '0');
  }
  console.log('Current streak:', state.streak);
  elements.nextBtn.disabled = false;
}

function showCongrats(){
  const streakCount = state.streak;
  let msgs;
  
  if(streakCount === 2) {
    msgs = {
      en: `🎉 AMAZING! Two in a row! 🌟 You're on fire! 🔥`,
      ta: `🎉 அற்புதம்! இரண்டு தொடர்ச்சி! 🌟 நீங்கள் சிறப்பாக செய்கிறீர்கள்! 🔥`
    };
  } else {
    msgs = {
      en: `🚀 INCREDIBLE! ${streakCount} in a row! 💫 Keep going champion! 🏆`,
      ta: `🚀 நம்பமுடியாதது! ${streakCount} தொடர்ச்சி! 💫 தொடர்ந்து செய்யுங்கள் வீரர்! 🏆`
    };
  }
  
  // Create the celebrate element if it doesn't exist
  let celebrate = document.getElementById('celebrate');
  if(!celebrate) {
    celebrate = document.createElement('div');
    celebrate.id = 'celebrate';
    celebrate.className = 'celebrate';
    celebrate.hidden = true;
    document.body.appendChild(celebrate);
  }
  
  celebrate.textContent = msgs[state.language];
  celebrate.hidden = false;
  celebrate.classList.add('show');
  
  // Create confetti burst
  burstConfetti();
  
  setTimeout(()=>{
    celebrate.classList.remove('show');
    celebrate.hidden = true;
  }, 1100);
}

function burstConfetti(){
  // Create confetti root if it doesn't exist
  let confettiRoot = document.getElementById('confetti-root');
  if(!confettiRoot) {
    confettiRoot = document.createElement('div');
    confettiRoot.id = 'confetti-root';
    confettiRoot.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;z-index:9999;overflow:visible';
    document.body.appendChild(confettiRoot);
  }
  
  confettiRoot.innerHTML = '';
  const colors = ['#ff3b3b','#ff9f0a','#ffd60a','#32d74b','#0a84ff','#5e5ce6','#ff2d55','#64d2ff'];
  const count = 260; // higher density
  const centerX = window.innerWidth/2;
  const centerY = window.innerHeight/2 - 80;
  
  for(let i=0;i<count;i++){
    const p = document.createElement('div');
    p.className = 'sparkle';
    const angle = Math.random() * Math.PI * 2;
    const radius = 240 + Math.random()*560;
    const tx = Math.cos(angle) * radius + (Math.random()*40-20);
    const ty = Math.sin(angle) * radius + (Math.random()*40-20);
    p.style.left = centerX + 'px';
    p.style.top = centerY + 'px';
    p.style.setProperty('--tx', tx+'px');
    p.style.setProperty('--ty', ty+'px');
    p.style.background = colors[Math.floor(Math.random()*colors.length)];
    confettiRoot.appendChild(p);
  }
  
  // Show central appreciation message
  if(celebrate){
    celebrate.textContent = 'Great job! 🎉';
    celebrate.hidden = false;
    celebrate.classList.add('show');
  }
  
  // Create overlay if it doesn't exist
  let overlay = document.getElementById('celebrate-overlay');
  if(!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'celebrate-overlay';
    overlay.className = 'celebrate-overlay';
    overlay.hidden = true;
    document.body.appendChild(overlay);
  }
  
  overlay.hidden = false;
  
  setTimeout(()=>{ 
    if(confettiRoot) confettiRoot.innerHTML=''; 
    if(celebrate){ celebrate.classList.remove('show'); celebrate.hidden = true; }
    if(overlay){ overlay.hidden = true; }
  }, 1100);
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
      elements.backBtn.hidden = false; // on avatar screen, show back
      return;
    }
    if(elements.avatarSection && !elements.avatarSection.hidden){
      // From avatar back to welcome page
      showWelcomePage();
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
  
  // Add cleanup handlers for when user leaves
  window.addEventListener('beforeunload', () => {
    if (state.grade && state.subject) {
      setTracker.cleanup(state.grade, state.subject);
    }
  });
  
  // Also cleanup on page visibility change (mobile browsers)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.grade && state.subject) {
      setTracker.cleanup(state.grade, state.subject);
    }
  });
  
  // Show welcome page first
  showWelcomePage();
  
  // Set up begin button event listener
  if(elements.beginBtn) {
    elements.beginBtn.addEventListener('click', () => {
      showAvatarSelection();
    });
  }
  
  // Hide other sections initially
  if(elements.avatarSection) elements.avatarSection.hidden = true;
  if(elements.landing) elements.landing.hidden = true;
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
  // automatically proceed to level selection after a brief delay
  setTimeout(() => {
    goToLevelFromAvatar();
  }, 300);
}

function goToLevelFromAvatar(){
  if(elements.avatarSection) elements.avatarSection.hidden = true;
  showLevelSelection();
  elements.backBtn.hidden = false;
}

function showAvatarSelection(){
  renderAvatars();
  // Hide welcome page completely
  if(elements.welcome) elements.welcome.hidden = true;
  // Show avatar section
  elements.avatarSection.hidden = false;
  // Hide all other sections
  elements.landing.hidden = true;
  elements.gradeSection && (elements.gradeSection.hidden = true);
  elements.subjectSection && (elements.subjectSection.hidden = true);
  elements.questionCard.hidden = true;
  elements.backBtn.hidden = false; // Show back button on avatar page
  // localized labels
  applyLanguage();
  // Continue button removed - avatar selection now auto-proceeds
}

function showWelcomePage(){
  if(elements.welcome) {
    elements.welcome.hidden = false;
  }
  if(elements.avatarSection) elements.avatarSection.hidden = true;
  if(elements.landing) elements.landing.hidden = true;
  if(elements.gradeSection) elements.gradeSection.hidden = true;
  if(elements.subjectSection) elements.subjectSection.hidden = true;
  if(elements.questionCard) elements.questionCard.hidden = true;
  elements.backBtn.hidden = true;
  
  // Apply welcome page language
  applyWelcomeLanguage();
}

function applyWelcomeLanguage(){
  const welcome = TEXTS[state.language].welcome;
  if(elements.welcomeTitle) elements.welcomeTitle.textContent = welcome.title;
  if(elements.welcomeSub) elements.welcomeSub.textContent = welcome.subtitle;
  if(elements.beginBtn) elements.beginBtn.textContent = welcome.beginBtn;
  if(elements.featureLevelsTitle) elements.featureLevelsTitle.textContent = welcome.featureLevels.title;
  if(elements.featureLevelsDesc) elements.featureLevelsDesc.textContent = welcome.featureLevels.desc;
  if(elements.featureBadgesTitle) elements.featureBadgesTitle.textContent = welcome.featureBadges.title;
  if(elements.featureBadgesDesc) elements.featureBadgesDesc.textContent = welcome.featureBadges.desc;
  if(elements.featureBilingualTitle) elements.featureBilingualTitle.textContent = welcome.featureBilingual.title;
  if(elements.featureBilingualDesc) elements.featureBilingualDesc.textContent = welcome.featureBilingual.desc;
}

function applyLanguage(){
  if(elements.backBtn) elements.backBtn.textContent = TEXTS[state.language].back;
  if(elements.avatarTitle) elements.avatarTitle.textContent = TEXTS[state.language].avatarTitle;
  // Avatar continue button removed
  
  // Apply welcome page language
  applyWelcomeLanguage();
  
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