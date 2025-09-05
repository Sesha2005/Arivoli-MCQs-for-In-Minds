// Minimal standalone quiz runner for quiz.html
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
  streak: Number(localStorage.getItem('streak') || 0),
  locked: false
};

const elements = {
  backBtn: document.getElementById('back-btn'),
  progressFill: document.getElementById('progress-fill'),
  progressText: document.getElementById('progress-text'),
  timerCircle: document.getElementById('timer-circle'),
  timerText: document.getElementById('timer-text'),
  counter: document.getElementById('counter'),
  streak: document.getElementById('streak'),
  questionText: document.getElementById('question-text'),
  options: document.getElementById('options'),
  confettiRoot: document.getElementById('confetti-root'),
  overlay: document.getElementById('celebrate-overlay'),
  celebrate: document.getElementById('celebrate')
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
  } catch(e){
    console.error(e);
    state.questions = [];
  }
}

function startQuiz(){
  const filtered = state.questions.filter(q => 
    q.difficulty === state.difficulty &&
    q.grade === state.grade &&
    q.subject === state.subject
  );
  if(filtered.length === 0){
    alert('No questions found for this selection.');
    window.history.back();
    return;
  }
  state.quizQuestions = shuffleArray([...filtered]).slice(0, state.totalQuestions);
  state.currentQuizIndex = 0;
  state.correctAnswers = 0;
  renderQuizQuestion();
}

function renderQuizQuestion(){
  if(state.currentQuizIndex >= state.quizQuestions.length){
    showQuizResults();
    return;
  }
  const q = state.quizQuestions[state.currentQuizIndex];
  const progress = ((state.currentQuizIndex + 1) / state.totalQuestions) * 100;
  elements.progressFill.style.width = `${progress}%`;
  elements.progressText.textContent = `${state.currentQuizIndex + 1}/${state.totalQuestions}`;
  elements.counter.textContent = `${state.currentQuizIndex + 1} / ${state.totalQuestions}`;
  // Beginner (Grade 6-8) -> 20s, otherwise 30s
  const beginnerGrades = new Set(['Grade 6','Grade 7','Grade 8']);
  state.timeLeft = (state.difficulty === 'beginner' || beginnerGrades.has(state.grade)) ? 20 : 30;
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
    state.streak += 1;
    showCongrats();
    burstConfetti();
  } else {
    state.streak = 0;
  }
  localStorage.setItem('streak', String(state.streak));
  elements.streak.textContent = `Streak: ${state.streak}`;
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
  const percentage = Math.round((state.correctAnswers / state.totalQuestions) * 100);
  elements.questionText.textContent = `Quiz Complete! You scored ${state.correctAnswers}/${state.totalQuestions} (${percentage}%)`;
  elements.options.innerHTML = '';
  elements.progressFill.style.width = '100%';
  elements.timerCircle.style.display = 'none';
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
    window.location.href = 'index.html';
  });
}

function showCongrats(){
  if(!elements.celebrate) return;
  elements.celebrate.textContent = state.streak > 1 ? `Great! ${state.streak} in a row! 🎉` : 'Correct! 🎉';
  elements.celebrate.hidden = false;
  elements.celebrate.classList.add('show');
  setTimeout(()=>{
    elements.celebrate.classList.remove('show');
    elements.celebrate.hidden = true;
  }, 1100);
}

function burstConfetti(){
  if(!elements.confettiRoot) return;
  elements.confettiRoot.innerHTML = '';
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
    elements.confettiRoot.appendChild(p);
  }
  // Show central appreciation message
  if(elements.celebrate){
    elements.celebrate.textContent = state.streak > 1 ? `Amazing! ${state.streak} correct in a row! 🎉` : 'Great job! 🎉';
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
  bindUI();
  parseParams();
  await loadQuestions();
  startQuiz();
})();


