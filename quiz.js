// Minimal standalone quiz runner for quiz.html - Updated 2025-01-06 22:17
const state = {
  language: localStorage.getItem('lang') || 'en',
  difficulty: localStorage.getItem('diff') || 'beginner',
  grade: null,
  subject: null,
  questions: [],
  quizQuestions: [],
  currentQuizIndex: 0,
  timer: null,
  timeLeft: 30,
  totalQuestions: 10,
  correctAnswers: 0,
  locked: false,
  currentSet: null,
  streak: parseInt(localStorage.getItem('streak')) || 0
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

const elements = {
  backBtn: document.getElementById('back-btn'),
  progressFill: document.getElementById('progress-fill'),
  progressText: document.getElementById('progress-text'),
  timerCircle: document.getElementById('timer-circle'),
  timerText: document.getElementById('timer-text'),
  counter: document.getElementById('counter'),
  questionText: document.getElementById('question-text'),
  options: document.getElementById('options'),
  confettiRoot: document.getElementById('confetti-root'),
  overlay: document.getElementById('celebrate-overlay'),
  celebrate: document.getElementById('celebrate'),
  gradeDisplay: document.getElementById('grade-display'),
  subjectDisplay: document.getElementById('subject-display')
};

// Audio system for answer feedback
const audioSystem = {
  correctSound: null,
  wrongSound: null,
  
  init() {
    this.correctSound = new Audio('sounds/correct.mp3');
    this.wrongSound = new Audio('sounds/wrong.mp3');
  },
  
  playCorrect() {
    try {
      if (this.correctSound) {
        this.correctSound.currentTime = 0;
        this.correctSound.play().catch(e => console.log('Correct sound failed:', e));
      }
    } catch (e) {
      console.log('Correct sound error:', e);
    }
  },
  
  playWrong() {
    try {
      if (this.wrongSound) {
        this.wrongSound.currentTime = 0;
        this.wrongSound.play().catch(e => console.log('Wrong sound failed:', e));
      }
    } catch (e) {
      console.log('Wrong sound error:', e);
    }
  }
};

function parseParams(){
  const url = new URL(window.location.href);
  const grade = url.searchParams.get('grade');
  const subject = url.searchParams.get('subject');
  const difficulty = url.searchParams.get('difficulty');
  if(grade) state.grade = grade;
  if(subject) state.subject = subject;
  if(difficulty) state.difficulty = difficulty;
}

async function loadQuestions(){
  try{
    const res = await fetch('questions.json');
    if(!res.ok) throw new Error('Failed to fetch questions.json');
    const all = await res.json();
    state.questions = Array.isArray(all) ? all : [];
    console.log(`Loaded ${state.questions.length} questions from questions.json`);
  } catch(e){
    console.error('Error loading questions:', e);
    state.questions = [];
    alert('Failed to load questions. Please refresh the page.');
  }
}

function startQuiz(){
  // Update grade and subject display
  if (elements.gradeDisplay) {
    // Extract grade number from "Grade 10" format
    const gradeNumber = state.grade ? state.grade.replace('Grade ', '') : '-';
    elements.gradeDisplay.textContent = gradeNumber;
  }
  if (elements.subjectDisplay) {
    // Create bilingual subject display
    const subjectTranslations = {
      physics: 'Physics (இயற்பியல்)',
      chemistry: 'Chemistry (வேதியியல்)',
      biology: 'Biology (உயிரியல்)'
    };
    elements.subjectDisplay.textContent = subjectTranslations[state.subject] || state.subject || '-';
  }
  
  // Get available sets for this grade/subject combination
  const availableSets = setTracker.getAvailableSets(state.grade, state.subject);
  
  if(availableSets.length === 0){
    alert('No available question sets. All sets are currently being used by other users or completed. Please try again in a moment.');
    window.history.back();
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
    q.subject === state.subject &&
    q.id.includes(`_set${selectedSet}_`)
  );
  
  console.log(`Found ${filtered.length} questions for ${state.grade} ${state.subject} set ${selectedSet}`);
  
  if(filtered.length === 0){
    console.error(`No questions found for: grade="${state.grade}", subject="${state.subject}", set=${selectedSet}`);
    console.log('Available questions:', state.questions.length);
    alert(`No questions found for set ${selectedSet} of this selection.\nLooking for: grade="${state.grade}", subject="${state.subject}"`);
    window.history.back();
    return;
  }
  
  // Ensure we have at least 10 questions, if not, use all available and adjust total
  if (filtered.length < state.totalQuestions) {
    console.warn(`Only ${filtered.length} questions available for this set, adjusting total`);
    state.totalQuestions = filtered.length;
  }
  
  // Shuffle and select questions from the chosen set
  state.quizQuestions = shuffleArray([...filtered]).slice(0, state.totalQuestions);
  state.currentQuizIndex = 0;
  state.correctAnswers = 0;
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
  const progress = ((state.currentQuizIndex + 1) / state.totalQuestions) * 100;
  elements.progressFill.style.width = `${progress}%`;
  elements.progressText.textContent = `${state.currentQuizIndex + 1}/${state.totalQuestions}`;
  elements.counter.textContent = `${state.currentQuizIndex + 1} / ${state.totalQuestions}`;
  // Timer based on difficulty: beginner=20s, intermediate=25s, advanced=30s
  const beginnerGrades = new Set(['Grade 6','Grade 7','Grade 8']);
  if (state.difficulty === 'beginner' || beginnerGrades.has(state.grade)) {
    state.timeLeft = 20;
  } else if (state.difficulty === 'intermediate') {
    state.timeLeft = 25;
  } else {
    state.timeLeft = 30; // advanced
  }
  startTimer();
  elements.questionText.innerHTML = `<div>${q.text.en}</div><div style="margin-top:6px;color:var(--muted);font-weight:600;">${q.text.ta}</div>`;
  elements.options.innerHTML = '';
  state.locked = false;
  q.options.forEach((opt, idx) => {
    const btn = document.createElement('button');
    btn.className = 'option';
    btn.setAttribute('data-id', String(idx));
    btn.innerHTML = `<span class="badge">${String.fromCharCode(65+idx)}</span><span><div>${opt.en}</div><div style=\"margin-top:4px;color:var(--muted);font-weight:600;\">(${opt.ta})</div></span>`;
    btn.addEventListener('click', () => onSelect(idx));
    btn.addEventListener('touchstart', () => onSelect(idx), {passive:true});
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
    elements.timerCircle.classList.remove('warning','danger');
    if(state.timeLeft <= 10){
      elements.timerCircle.classList.add('danger');
    } else if(state.timeLeft <= 15){
      elements.timerCircle.classList.add('warning');
    }
    if(state.timeLeft <= 0){
      clearInterval(state.timer);
      onSelect(-1);
    }
  }, 1000);
}

function onSelect(idx){
  if(state.locked) return;
  state.locked = true;
  clearInterval(state.timer);
  const q = state.quizQuestions[state.currentQuizIndex];
  const correct = idx === q.answerIndex;
  if(correct){
    state.correctAnswers++;
    // Increment streak for correct answer
    state.streak++;
    localStorage.setItem('streak', state.streak.toString());
    
    // Play correct answer sound
    audioSystem.playCorrect();
    
    // Prepare message depending on streak
    let centerMsg = 'Great job! 🎉';
    if (state.streak >= 2) {
      // when a streak is active show streak count (localized minimal)
      centerMsg = `${state.streak} in a row! Keep it up! 🌟`;
      // also show the small top-right congrats popup
      showCongrats();
    }
    // Show confetti + center message (for 1 correct it'll show 'Great job!')
    burstConfetti(centerMsg);
  } else {
    // Reset streak for incorrect answer
    state.streak = 0;
    localStorage.setItem('streak', '0');
    
    // Play wrong answer sound
    audioSystem.playWrong();
  }
  const buttons = Array.from(elements.options.querySelectorAll('.option'));
  buttons.forEach((b, i) => {
    if(i === q.answerIndex){ b.classList.add('correct'); }
    if(i === idx && !correct){ b.classList.add('wrong'); }
  });
  setTimeout(nextQuestion, 2000);
}

function nextQuestion(){
  state.currentQuizIndex++;
  renderQuizQuestion();
}


function showQuizResults(){
  console.log(`Quiz completed: ${state.correctAnswers}/${state.totalQuestions} questions answered`);
  console.log('Debug values:', { correctAnswers: state.correctAnswers, totalQuestions: state.totalQuestions });
  
  // Mark the current set as completed
  if(state.currentSet) {
    setTracker.markSetCompleted(state.grade, state.subject, state.currentSet);
    console.log(`Marked set ${state.currentSet} as completed for ${state.grade} ${state.subject}`);
  }
  
  // Clear any running timer
  if(state.timer) {
    clearInterval(state.timer);
  }
  
  // --- NEW: half-star logic where each correct answer = 0.5 star (max 5) ---
  // starValue is in 0.0 .. 5.0, step 0.5
  let starValue = state.correctAnswers * 0.5;
  if (starValue > 5) starValue = 5;
  // Round to nearest 0.5 just in case (defensive)
  starValue = Math.round(starValue * 2) / 2;
  
  const fullStars = Math.floor(starValue);
  const hasHalf = (starValue - fullStars) === 0.5;
  const emptyStars = 5 - fullStars - (hasHalf ? 1 : 0);
  
  // Inline SVG templates
  const svgFull = `<svg width="28" height="28" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path fill="gold" d="M12 .587l3.668 7.431L23.4 9.75l-5.7 5.562L19.336 24 12 19.897 4.664 24l1.636-8.688L.6 9.75l7.732-1.732L12 .587z"/>
  </svg>`;
  
  // Half star: draw full star in gray, then gold rectangle clipped to left 50%
  const svgHalf = `<svg width="28" height="28" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <clipPath id="halfClip">
        <rect x="0" y="0" width="12" height="24" />
      </clipPath>
    </defs>
    <path fill="#e6e6e6" d="M12 .587l3.668 7.431L23.4 9.75l-5.7 5.562L19.336 24 12 19.897 4.664 24l1.636-8.688L.6 9.75l7.732-1.732L12 .587z"/>
    <g clip-path="url(#halfClip)">
      <path fill="gold" d="M12 .587l3.668 7.431L23.4 9.75l-5.7 5.562L19.336 24 12 19.897 4.664 24l1.636-8.688L.6 9.75l7.732-1.732L12 .587z"/>
    </g>
  </svg>`;
  
  const svgEmpty = `<svg width="28" height="28" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path fill="#e6e6e6" d="M12 .587l3.668 7.431L23.4 9.75l-5.7 5.562L19.336 24 12 19.897 4.664 24l1.636-8.688L.6 9.75l7.732-1.732L12 .587z"/>
  </svg>`;
  
  // Build stars HTML
  let starsHTML = '<div style="display:flex;gap:6px;justify-content:center;margin:10px 0;align-items:center;">';
  for (let i = 0; i < fullStars; i++) starsHTML += `<span class="star-full" aria-hidden="true">${svgFull}</span>`;
  if (hasHalf) starsHTML += `<span class="star-half" aria-hidden="true">${svgHalf}</span>`;
  for (let i = 0; i < emptyStars; i++) starsHTML += `<span class="star-empty" aria-hidden="true">${svgEmpty}</span>`;
  starsHTML += '</div>';
  
  // Performance message (keeps your previous style / messages)
  let message = '';
  const percentage = Math.round((state.correctAnswers / state.totalQuestions) * 100);
  if (percentage >= 90) {
    message = 'Amazing! You’re a quiz champ! 🌟';
  } else if (percentage >= 70) {
    message = 'Great job! Keep it up!👏';
  } else if (percentage >= 50) {
    message = 'Good effort! Keep practicing! 📖';
  } else if (percentage >= 30) {
    message = 'Keep trying! You’ll improve! 👍';
  } else {
    message = 'Don’t give up! Study and succeed! 🎯';
  }
  
  // Hide grade and subject display on completion
  const gradeSubjectDisplay = document.querySelector('.grade-subject-display');
  if (gradeSubjectDisplay) {
    gradeSubjectDisplay.style.display = 'none';
  }

  // Hide progress bar and counter on completion
  const quizHeader = document.querySelector('.quiz-header');
  if (quizHeader) {
    quizHeader.style.display = 'none';
  }
  const metaSection = document.querySelector('.meta');
  if (metaSection) {
    metaSection.style.display = 'none';
  }

  // Inject results into UI
  elements.questionText.innerHTML = `
    <div style="text-align: center;">
      <h2>Quiz Completed! 🎉</h2>
      <p>You scored <strong>${state.correctAnswers}/${state.totalQuestions}</strong> (${percentage}%)</p>
      ${starsHTML}
      <div class="performance-message" style="margin-top:8px;font-weight:700;color:var(--muted);">${message}</div>
      <button onclick="window.location.href='index.html'" class="primary" style="margin-top: 20px;">Take Another Quiz</button>
    </div>
  `;
  elements.options.innerHTML = '';

  // ---------------------------
  // IMPORTANT: reset streak here so next quiz starts fresh
  // ---------------------------
  state.streak = 0;
  localStorage.setItem('streak', '0');
}

function shuffleArray(arr){
  for(let i=arr.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [arr[i],arr[j]] = [arr[j],arr[i]];
  }
  return arr;
}

function bindUI(){
  elements.backBtn.addEventListener('click', () => {
    // Reset streak when leaving quiz
    state.streak = 0;
    localStorage.setItem('streak', '0');
    window.location.href = 'index.html';
  });
}

function showCongrats(){
  const streakCount = state.streak;
  let msgs;
  
  if(streakCount === 2) {
    msgs = {
      en: `AMAZING! Two in a row! You're on fire! 🌟`,
      ta: `அற்புதம்! இரண்டு தொடர்ச்சி! நீங்கள் சிறப்பாக செய்கிறீர்கள்! 🌟`
    };
  } else {
    msgs = {
      en: `INCREDIBLE! ${streakCount} in a row!  Keep going champion! 🚀`,
      ta: `நம்பமுடியாதது! ${streakCount} தொடர்ச்சி!  தொடர்ந்து செய்யுங்கள் வீரர்! 🚀`
    };
  }
  
  if(!elements.celebrate) return;
  elements.celebrate.textContent = msgs[state.language];
  elements.celebrate.hidden = false;
  elements.celebrate.classList.add('show');
  setTimeout(()=>{
    elements.celebrate.classList.remove('show');
    elements.celebrate.hidden = true;
  }, 1100);
}

// UPDATED: burstConfetti now accepts an optional message and shows it in the center.
// If a streak is active (state.streak >= 2) we will show the streak in the center; otherwise we show the simple message.
function burstConfetti(centerMessage){
  if(!elements.confettiRoot) return;
  elements.confettiRoot.innerHTML = '';
  const colors = ['#ff3b3b','#ff9f0a','#ffd60a','#32d74b','#0a84ff','#5e5ce6','#ff2d55','#64d2ff','#ff6b6b','#4ecdc4','#45b7d1','#f9ca24','#f0932b','#eb4d4b','#6c5ce7','#a29bfe','#fd79a8','#e84393','#00b894','#00cec9'];
  const count = 500; // MASSIVE confetti explosion!
  const centerX = window.innerWidth/2;
  const centerY = window.innerHeight/2 - 80;
  for(let i=0;i<count;i++){
    const p = document.createElement('div');
    p.className = 'sparkle';
    const angle = Math.random() * Math.PI * 2;
    const radius = 180 + Math.random()*800;
    const tx = Math.cos(angle) * radius + (Math.random()*40-20);
    const ty = Math.sin(angle) * radius + (Math.random()*40-20);
    p.style.left = centerX + 'px';
    p.style.top = centerY + 'px';
    p.style.setProperty('--tx', tx+'px');
    p.style.setProperty('--ty', ty+'px');
    p.style.background = colors[Math.floor(Math.random()*colors.length)];
    elements.confettiRoot.appendChild(p);
  }
  // Determine the center text:
  let displayText = centerMessage || 'Great job! 🎉';
  if (state.streak >= 2) {
    // prefer a streak-specific message (overrides provided message if any)
    displayText = `${state.streak} correct in a row! Keep it up! 🌟`;
  }
  if(elements.celebrate){
    elements.celebrate.textContent = displayText;
    elements.celebrate.hidden = false;
    elements.celebrate.classList.add('show');
  }
  if(elements.overlay){ elements.overlay.hidden = false; }
  setTimeout(()=>{ 
    if(elements.confettiRoot) elements.confettiRoot.innerHTML=''; 
    if(elements.celebrate){ elements.celebrate.classList.remove('show'); elements.celebrate.hidden = true; }
    if(elements.overlay){ elements.overlay.hidden = true; }
  }, 1100);
}

(async function init(){
  console.log('Initializing quiz...');
  bindUI();
  parseParams();
  
  // Initialize audio system
  audioSystem.init();
  
  console.log('Quiz parameters:', { grade: state.grade, subject: state.subject, difficulty: state.difficulty });
  
  if (!state.grade || !state.subject) {
    alert('Missing quiz parameters. Redirecting to main page.');
    window.location.href = 'index.html';
    return;
  }
  
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
  
  await loadQuestions();
  
  if (state.questions.length === 0) {
    alert('No questions available. Please try again later.');
    window.location.href = 'index.html';
    return;
  }
  
  startQuiz();
})();