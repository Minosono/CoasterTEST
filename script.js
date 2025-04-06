// --- Configuration ---
// IMPORTANT: Replace this URL with the one you got after deploying your Google Apps Script!
const LEADERBOARD_API_URL = 'https://script.google.com/macros/s/AKfycbyHaQDyr8KNT9lBtkwCxo3goxwvjTL5BBomIlYGDQL-YPsOkUBGGh4I4q7LBPAC8P9J/exec'; // <--- REPLACE

const COASTER_DATA_URL = 'coasters.json'; // Path to your coaster data file
const HARD_MODE_TIME = 15; // Seconds for hard mode timer
const EASY_MODE_TIME = 20; // Seconds for easy mode timer
const HINT_DELAY = 5000;   // Milliseconds before hint button appears
const AUTOPLAY_DELAY = 4000; // Milliseconds delay for autoplay

// --- Global State ---
let allCoasters = [];       // Full list of coasters loaded from JSON
let availableCoasters = []; // Coasters available in the current shuffled session
let currentCoaster;         // The coaster currently displayed
let streakCount = 0;        // Current correct answer streak
let personalBestStreak = 0; // Highest streak achieved locally (persisted)
let answered = false;       // Flag if the current question has been answered
let isHardMode = true;      // Current difficulty mode
let isAutoplay = false;     // Autoplay mode enabled/disabled
let hintUsed = false;       // If the hint was used for the current coaster
let guessTimerInterval;     // Interval ID for the countdown timer
let autoplayTimeout;        // Timeout ID for autoplay delay
let hintTimeout;            // Timeout ID for hint button delay
let guessStartTime;         // Timestamp when the round started (for avg time)
let correctGuessTimes = []; // Array storing times (ms) of correct guesses
let lastSubmittedName = ''; // Last name used for leaderboard submission (persisted)

// --- DOM Elements (Cache References) ---
// (Using a constant object makes it slightly cleaner to access)
const DOMElements = {
    body: document.body,
    modeSwitch: document.getElementById('mode-switch'),
    modeLabel: document.getElementById('mode-label'),
    autoplaySwitch: document.getElementById('autoplay-switch'),
    darkModeSwitch: document.getElementById('dark-mode-switch'),
    guessTimer: document.getElementById('guess-timer'),
    loadingIndicator: document.getElementById('loading-indicator'),
    coasterImage: document.getElementById('coaster-image'),
    inputContainer: document.getElementById('input-container'),
    manufacturerInput: document.getElementById('manufacturer-input'),
    checkButton: document.getElementById('check-button'),
    optionsContainer: document.getElementById('options-container'),
    hintButton: document.getElementById('hint-button'),
    hintDisplay: document.getElementById('hint-display'),
    result: document.getElementById('result'),
    nextButton: document.getElementById('next-button'),
    detailsCard: document.getElementById('details-card'),
    coasterName: document.getElementById('coaster-name'),
    coasterPark: document.getElementById('coaster-park'),
    coasterCountry: document.getElementById('coaster-country'),
    coasterOpeningDate: document.getElementById('coaster-opening-date'),
    statsDisplay: document.getElementById('stats-display'),
    streak: document.getElementById('streak'),
    highestStreak: document.getElementById('highest-streak'),
    avgTime: document.getElementById('avg-time'),
    submitScoreArea: document.getElementById('submit-score-area'),
    playerNameInput: document.getElementById('player-name'),
    submitScoreButton: document.getElementById('submit-score-button'),
    leaderboardSection: document.getElementById('leaderboard-section'),
    leaderboardList: document.getElementById('leaderboard-list'),
    refreshLeaderboardButton: document.getElementById('refresh-leaderboard'),
    toggleMfgButton: document.getElementById('toggle-mfg-button'),
    manufacturerListContainer: document.getElementById('manufacturer-list'),
    quizContainer: document.getElementById('quiz-container') // Main quiz parent div
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', initializeQuiz);

async function initializeQuiz() {
    console.log("Initializing Quiz...");
    setupEventListeners();
    loadLocalSettings(); // Load dark mode, PBs, last name etc. before fetching

    try {
        showLoadingMessage("Loading Coaster Data...", false);
        allCoasters = await fetchCoasterData();

        if (!allCoasters || allCoasters.length === 0) {
             showLoadingMessage("Error: No coaster data found or loaded. Please check 'coasters.json' and ensure it's accessible.", true);
             return; // Stop initialization if data fails
        }

        availableCoasters = [...allCoasters]; // Initialize available list
        console.log(`Successfully loaded ${allCoasters.length} coasters.`);

        // Attempt initial leaderboard fetch only if URL seems valid
        if (LEADERBOARD_API_URL.startsWith('https://script.google.com')) {
            fetchLeaderboard();
        } else {
            console.warn("Leaderboard API URL not configured. Leaderboard disabled.");
            DOMElements.leaderboardList.innerHTML = '<li>Leaderboard not configured.</li>';
            DOMElements.leaderboardSection.classList.remove('hidden'); // Still show section but with message
            DOMElements.refreshLeaderboardButton.disabled = true;
        }

        startNewRound(); // Load the first coaster and start the game
        DOMElements.loadingIndicator.classList.add('hidden'); // Hide "Loading Coaster Data" text
        DOMElements.statsDisplay.classList.remove('hidden'); // Show stats block
        DOMElements.leaderboardSection.classList.remove('hidden'); // Show leaderboard section

    } catch (error) {
        console.error("Initialization failed:", error);
        showLoadingMessage(`Initialization Error: ${error.message}. Check console.`, true);
    }
}

function setupEventListeners() {
    DOMElements.darkModeSwitch.addEventListener('change', toggleDarkMode);
    DOMElements.modeSwitch.addEventListener('change', toggleMode);
    DOMElements.autoplaySwitch.addEventListener('change', toggleAutoplay);
    DOMElements.checkButton.addEventListener('click', checkAnswer);
    DOMElements.nextButton.addEventListener('click', startNewRound);
    DOMElements.hintButton.addEventListener('click', getHint);
    DOMElements.manufacturerInput.addEventListener('keypress', handleKeyPress);
    DOMElements.submitScoreButton.addEventListener('click', submitScore);
    DOMElements.playerNameInput.addEventListener('keypress', handleKeyPress);
    DOMElements.refreshLeaderboardButton.addEventListener('click', fetchLeaderboard);
    DOMElements.toggleMfgButton.addEventListener('click', toggleManufacturerList);
    // Event delegation for options buttons (added in loadOptions) is handled there
}

function loadLocalSettings() {
    // Dark Mode Preference
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const localDark = localStorage.getItem('darkMode');
    const useDark = localDark === 'true' || (localDark === null && prefersDark);
    DOMElements.darkModeSwitch.checked = useDark;
    if (useDark) DOMElements.body.classList.add('dark-mode');

    // Load Personal Best Streak & Avg Time Data
    personalBestStreak = parseInt(localStorage.getItem('personalBestStreak') || '0', 10);
    const savedTimes = localStorage.getItem('correctGuessTimes');
    correctGuessTimes = savedTimes ? JSON.parse(savedTimes) : [];

    // Load Last Submitted Name
    lastSubmittedName = localStorage.getItem('lastPlayerName') || '';

    // Update Displays
    updateStatsDisplay();
    DOMElements.modeLabel.textContent = isHardMode ? 'HARD' : 'EASY';
}

// --- Data Fetching ---
async function fetchCoasterData() {
    try {
        const response = await fetch(COASTER_DATA_URL);
        if (!response.ok) {
            throw new Error(`HTTP error fetching ${COASTER_DATA_URL}! Status: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        if (!Array.isArray(data)) {
            throw new Error("Invalid data format: Expected an array from coasters.json.");
        }
        // Add basic validation for a few items?
        if (data.length > 0 && (!data[0].image || !data[0].manufacturer || !Array.isArray(data[0].manufacturer))) {
            console.warn("Coaster data format might be incorrect. Expected 'image' and 'manufacturer' (as array).");
        }
        return data;
    } catch (error) {
        console.error("Failed to fetch or parse coaster data:", error);
        throw error; // Re-throw for the initializer to catch
    }
}

// --- Game Flow Logic ---
function startNewRound() {
    console.log("Starting new round...");
    resetUIForNewRound(); // Clear timers, results, inputs etc.

    if (availableCoasters.length === 0) {
        if (allCoasters.length === 0) {
            showErrorMessage("Fatal Error: No coasters loaded to play!");
            return; // Stop if no coasters were ever loaded
        }
        console.log("Reshuffling coasters...");
        availableCoasters = [...allCoasters]; // Reshuffle
    }

    // Select and remove a coaster from the available pool
    const randomIndex = Math.floor(Math.random() * availableCoasters.length);
    currentCoaster = availableCoasters.splice(randomIndex, 1)[0];
    console.log(`Selected Coaster: ${currentCoaster.id} - ${currentCoaster.name}`);

    // Set up image loading
    DOMElements.coasterImage.alt = "Loading coaster image..."; // Placeholder alt text
    const img = new Image();
    img.onload = () => {
        DOMElements.coasterImage.src = img.src;
        DOMElements.coasterImage.alt = `Roller coaster: ${currentCoaster.name || 'Unknown Name'}`;
        DOMElements.coasterImage.classList.remove('hidden');
        DOMElements.loadingIndicator.classList.add('hidden');
        setupRoundUI(); // Enable inputs, start timers etc. AFTER image is ready
    };
    img.onerror = (e) => {
        console.error("Error loading image for:", currentCoaster.name, `(${currentCoaster.image})`, e);
        DOMElements.coasterImage.alt = "Error loading image";
        DOMElements.coasterImage.classList.remove('hidden'); // Show the alt text error
        DOMElements.loadingIndicator.classList.add('hidden');
        showErrorMessage(`⚠️ Image Error for ${currentCoaster.name}! Skipping...`);
        setTimeout(startNewRound, 2000); // Auto-skip after a delay
    };

    // Handle potential relative paths vs absolute URLs
    DOMElements.loadingIndicator.classList.remove('hidden'); // Show text loading indicator
    DOMElements.loadingIndicator.textContent = `Loading ${currentCoaster.name || 'coaster'}... ⏳`;
    img.src = currentCoaster.image.startsWith('http') || currentCoaster.image.startsWith('//') ? currentCoaster.image : currentCoaster.image; // Assume relative path otherwise
}

function resetUIForNewRound() {
    // Clear timers & timeouts
    clearTimeout(autoplayTimeout);
    clearTimeout(hintTimeout);
    clearInterval(guessTimerInterval);

    // Reset display elements
    DOMElements.coasterImage.classList.add('hidden');
    DOMElements.coasterImage.src = ""; // Clear src to prevent flashing old image
    DOMElements.loadingIndicator.classList.remove('hidden'); // Show loading text initially
    DOMElements.loadingIndicator.textContent = "Loading next coaster... ⏳";
    DOMElements.result.textContent = '';
    DOMElements.result.className = 'result'; // Reset result styling
    DOMElements.detailsCard.classList.add('hidden');
    DOMElements.detailsCard.classList.remove('show');
    DOMElements.nextButton.classList.add('hidden');
    DOMElements.hintButton.classList.add('hidden');
    DOMElements.hintButton.disabled = false; // Re-enable for next round
    DOMElements.hintDisplay.textContent = '';
    DOMElements.guessTimer.textContent = '--';
    DOMElements.guessTimer.style.color = 'inherit';
    DOMElements.submitScoreArea.classList.add('hidden');

    // Reset inputs/options
    DOMElements.manufacturerInput.value = '';
    DOMElements.manufacturerInput.disabled = true; // Disable until image loads
    DOMElements.checkButton.disabled = true; // Disable until image loads
    DOMElements.optionsContainer.innerHTML = '';
    DOMElements.inputContainer.classList.add('hidden');
    DOMElements.optionsContainer.classList.add('hidden');

    // Clear potential lingering flash effects
    DOMElements.inputContainer.classList.remove('correct-flash', 'incorrect-flash');
    DOMElements.optionsContainer.classList.remove('correct-flash', 'incorrect-flash');
}

function setupRoundUI() {
    answered = false;
    hintUsed = false;
    updateDetailsDisplay(false); // Pre-populate hidden details card data

    // Enable inputs/buttons now that image is loaded
    DOMElements.manufacturerInput.disabled = false;
    DOMElements.checkButton.disabled = false;

    // Show appropriate input mode
    if (isHardMode) {
        DOMElements.inputContainer.classList.remove('hidden');
        DOMElements.optionsContainer.classList.add('hidden');
        // Small delay might be needed for focus to work consistently after display change
        setTimeout(() => DOMElements.manufacturerInput.focus(), 50);
    } else {
        DOMElements.inputContainer.classList.add('hidden');
        DOMElements.optionsContainer.classList.remove('hidden');
        loadOptions(); // Load options and attach listeners
    }

    guessStartTime = performance.now();
    startGuessTimer(); // Start the countdown

    // Schedule hint button
    hintTimeout = setTimeout(() => {
        if (!answered) {
            DOMElements.hintButton.classList.remove('hidden');
        }
    }, HINT_DELAY);
}

function loadOptions() {
    if (!currentCoaster || !allCoasters) return;

    const correctManufacturer = currentCoaster.manufacturer[0]; // Primary correct name
    // Create a pool of unique manufacturers *excluding* any alias of the correct one
    const correctAliasesLower = new Set(currentCoaster.manufacturer.map(m => m.toLowerCase()));
    const distractorPool = [...new Set(allCoasters.flatMap(c => c.manufacturer))] // All manufacturers from all coasters
                            .filter(m => !correctAliasesLower.has(m.toLowerCase())); // Filter out correct ones

    // Shuffle the pool and pick 3 distractors
    distractorPool.sort(() => 0.5 - Math.random());
    const options = new Set([correctManufacturer]); // Start with the correct primary name
    for(let i = 0; i < Math.min(3, distractorPool.length); i++) {
        options.add(distractorPool[i]);
    }

    // Fallback if needed (highly unlikely with decent data)
    let fallbackCount = 1;
    while(options.size < 4) { options.add(`Wrong Option ${fallbackCount++}`); }

    const shuffledOptions = Array.from(options).sort(() => Math.random() - 0.5);
    DOMElements.optionsContainer.innerHTML = shuffledOptions.map(option =>
        `<button type="button" class="option-button">${escapeHtml(option)}</button>`
    ).join('');

    // Add event listeners AFTER buttons are in the DOM
     document.querySelectorAll('.option-button').forEach(button => {
        button.addEventListener('click', () => selectOption(button.textContent));
     });
}

function selectOption(optionText) {
    if (answered) return;
    DOMElements.manufacturerInput.value = optionText; // Set value just in case
    checkAnswer();
}


// --- Answer Checking & Timing ---
function startGuessTimer() {
    clearInterval(guessTimerInterval); // Clear any existing timer
    const timeLimit = isHardMode ? HARD_MODE_TIME : EASY_MODE_TIME;
    let remainingTime = timeLimit;

    const updateDisplay = () => {
        DOMElements.guessTimer.textContent = remainingTime >= 0 ? remainingTime : 0;
        // Change color when time is low (e.g., <= 5 seconds)
        DOMElements.guessTimer.style.color = remainingTime <= 5 ? 'var(--incorrect-color)' : 'inherit';
    };

    updateDisplay(); // Show initial time
    guessTimerInterval = setInterval(() => {
        remainingTime--;
        updateDisplay();
        if (remainingTime < 0) { // Use < 0 so 0 is displayed
            handleTimeout();
        }
    }, 1000);
}

function handleTimeout() {
    if (answered) return; // Prevent running if already answered
    console.log("Timer expired.");
    processAnswer(false, "Time's up! "); // Mark as incorrect due to timeout
}

function checkAnswer() {
    if (answered) return;
    const userAnswer = DOMElements.manufacturerInput.value.trim().toLowerCase();
    const correct = isCorrectAnswer(userAnswer);
    processAnswer(correct);
}

function processAnswer(isCorrect, prefix = "") {
    if (answered) return; // Double check to prevent race conditions

    answered = true; // Mark as answered
    clearInterval(guessTimerInterval); // Stop the timer
    clearTimeout(hintTimeout); // Cancel hint if it hasn't appeared
    disableInputs(); // Disable input fields/buttons

    if (!currentCoaster) {
        console.error("ProcessAnswer called without currentCoaster set!");
        return; // Should not happen, but safety check
    }

    const correctManufacturerDisplay = currentCoaster.manufacturer[0]; // Primary name for display
    const feedbackContainer = isHardMode ? DOMElements.inputContainer : DOMElements.optionsContainer;
    const flashClass = isCorrect ? 'correct-flash' : 'incorrect-flash';
    const resultClass = isCorrect ? 'result correct' : 'result incorrect';
    const resultEmoji = isCorrect ? '✅' : '❌';

    if (isCorrect) {
        streakCount++;
        if (streakCount > personalBestStreak) {
            personalBestStreak = streakCount; // Update local PB
        }
        const guessTime = performance.now() - guessStartTime;
        correctGuessTimes.push(guessTime); // Add time for avg calculation
        DOMElements.result.textContent = `${prefix}${resultEmoji} Correct! It's ${escapeHtml(correctManufacturerDisplay)}.`;
    } else {
        DOMElements.result.textContent = `${prefix}${resultEmoji} Incorrect! The correct answer was ${escapeHtml(correctManufacturerDisplay)}.`;
        // Check leaderboard potential *only if* the ended streak was > 0
        if (streakCount > 0) {
            checkAndPromptForLeaderboard(streakCount); // Pass the final streak value
        }
        streakCount = 0; // Reset streak *after* leaderboard check
    }

    DOMElements.result.className = resultClass; // Apply correct/incorrect style
    feedbackContainer.classList.add(flashClass); // Trigger flash effect
    setTimeout(() => feedbackContainer.classList.remove(flashClass), 600); // Remove flash class after animation

    updateStatsDisplay(); // Update streak, PB, avg time displays
    saveLocalSettings(); // Save updated PB and times
    revealAnswerAndProceed(); // Show details card and next button/autoplay
}

function disableInputs() {
    DOMElements.manufacturerInput.disabled = true;
    DOMElements.checkButton.disabled = true;
    DOMElements.hintButton.classList.add('hidden'); // Ensure hint is hidden
    // Disable options buttons if they exist
    document.querySelectorAll('.option-button').forEach(btn => btn.disabled = true);
}

function isCorrectAnswer(userAnswer) {
    if (!userAnswer || !currentCoaster || !currentCoaster.manufacturer) {
        return false;
    }
    const userAnswerLower = userAnswer.toLowerCase();
    // Check against all provided manufacturer names/aliases
    return currentCoaster.manufacturer.some(alias => {
        const aliasLower = alias.toLowerCase();
        const distance = levenshteinDistance(userAnswerLower, aliasLower);
        // Allow 1 error for very short names, ~25% for longer names
        const threshold = aliasLower.length <= 4 ? 1 : Math.floor(aliasLower.length * 0.26);
        return distance <= threshold;
    });
}

function levenshteinDistance(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
    for (let i = 0; i <= a.length; i++) { matrix[0][i] = i; }
    for (let j = 0; j <= b.length; j++) { matrix[j][0] = j; }
    for (let j = 1; j <= b.length; j++) {
        for (let i = 1; i <= a.length; i++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[j][i] = Math.min(
                matrix[j][i - 1] + 1, // Deletion
                matrix[j - 1][i] + 1, // Insertion
                matrix[j - 1][i - 1] + cost // Substitution
            );
        }
    }
    return matrix[b.length][a.length];
}


function revealAnswerAndProceed() {
    updateDetailsDisplay(true); // Show the details card (with animation)
    if (isAutoplay) {
        DOMElements.nextButton.classList.add('hidden'); // Ensure Next button is hidden
        DOMElements.guessTimer.textContent = `Next...`; // Indicate moving on
        autoplayTimeout = setTimeout(startNewRound, AUTOPLAY_DELAY);
    } else {
        DOMElements.nextButton.classList.remove('hidden'); // Show the Next button
    }
}

// --- UI Updates & Helpers ---
function showLoadingMessage(message, isError = false) {
     DOMElements.loadingIndicator.textContent = message;
     DOMElements.loadingIndicator.style.color = isError ? 'var(--incorrect-color)' : 'inherit';
     DOMElements.loadingIndicator.classList.remove('hidden');
     // Dim the quiz area during critical loading phases
     DOMElements.quizContainer.style.opacity = 0.5;
     // Hide elements that shouldn't be shown yet
      DOMElements.coasterImage.classList.add('hidden');
      DOMElements.inputContainer.classList.add('hidden');
      DOMElements.optionsContainer.classList.add('hidden');
      DOMElements.statsDisplay.classList.add('hidden');
      DOMElements.leaderboardSection.classList.add('hidden');
 }
 function showErrorMessage(message) {
     DOMElements.result.textContent = message;
     DOMElements.result.className = 'result incorrect'; // Style as an error
 }

function updateDetailsDisplay(showCard) {
     if (!currentCoaster) return;
     // Populate the card's content
     DOMElements.coasterName.textContent = currentCoaster.name || 'N/A';
     DOMElements.coasterPark.textContent = currentCoaster.park || 'N/A';
     DOMElements.coasterCountry.textContent = currentCoaster.country || 'N/A';
     DOMElements.coasterOpeningDate.textContent = currentCoaster.openingDate || 'N/A';
     // Control card visibility/animation
     if(showCard) {
        DOMElements.detailsCard.classList.remove('hidden');
        // Force reflow to ensure animation restarts if card was hidden quickly
        void DOMElements.detailsCard.offsetWidth;
        DOMElements.detailsCard.classList.add('show');
     } else {
         DOMElements.detailsCard.classList.remove('show');
          // Optionally hide it completely after animation ends if needed
          // setTimeout(() => { DOMElements.detailsCard.classList.add('hidden'); }, 400); // Match CSS transition
          DOMElements.detailsCard.classList.add('hidden'); // Hide immediately for setup
     }
}

function getHint() {
    if (hintUsed || answered || !currentCoaster) return;
    hintUsed = true;
    DOMElements.hintButton.disabled = true; // Visually disable
    DOMElements.hintButton.style.opacity = 0.6; // Dim hint button
    DOMElements.hintDisplay.textContent = `Hint: Located in ${currentCoaster.country || '?'} at park "${currentCoaster.park || '?'}"`;
}

function updateStatsDisplay() {
    DOMElements.streak.textContent = streakCount;
    DOMElements.highestStreak.textContent = personalBestStreak; // Show local persisted best

    if (correctGuessTimes.length > 0) {
        const sum = correctGuessTimes.reduce((acc, time) => acc + time, 0);
        const averageSec = (sum / correctGuessTimes.length / 1000).toFixed(1);
        DOMElements.avgTime.textContent = `${averageSec}s`;
    } else {
        DOMElements.avgTime.textContent = `N/A`;
    }
}

function toggleMode() {
    isHardMode = !isHardMode;
    DOMElements.modeLabel.textContent = isHardMode ? 'HARD' : 'EASY';
    DOMElements.modeSwitch.checked = isHardMode; // Ensure switch reflects state

     // Resetting the round provides a cleaner transition
     if (currentCoaster) {
         showLoadingMessage("Switching difficulty...", false); // Use non-error style
         // If a round was in progress, put the coaster back
         if (!answered && currentCoaster) {
             availableCoasters.push(currentCoaster);
         }
        // Start a completely new round shortly after message shows
        setTimeout(startNewRound, 150);
     } else {
         // If no game started yet, just update UI state (already done)
         console.log("Difficulty changed before first round.");
     }
}

function toggleAutoplay() {
    isAutoplay = !isAutoplay;
    DOMElements.autoplaySwitch.checked = isAutoplay; // Sync checkbox
    console.log("Autoplay toggled:", isAutoplay);
    if (!isAutoplay) {
        clearTimeout(autoplayTimeout); // Stop any pending autoplay next round
        // If a round just finished, show the NEXT button
        if (answered) DOMElements.nextButton.classList.remove('hidden');
    } else {
        // If a round just finished, hide NEXT button and trigger autoplay
        if (answered) {
            DOMElements.nextButton.classList.add('hidden');
            DOMElements.guessTimer.textContent = `Next...`; // Indicate move
            autoplayTimeout = setTimeout(startNewRound, 1000); // Shorter delay after manual answer
        }
    }
}

function toggleDarkMode() {
    const isDark = DOMElements.body.classList.toggle('dark-mode');
    localStorage.setItem('darkMode', isDark); // Save preference
     DOMElements.darkModeSwitch.checked = isDark; // Sync checkbox
}

function handleKeyPress(event) {
    const target = event.target;
     if (event.key === 'Enter') {
         if (target === DOMElements.manufacturerInput && !answered && isHardMode) {
            event.preventDefault(); // Prevent default browser actions
             checkAnswer();
         } else if (target === DOMElements.playerNameInput) {
             event.preventDefault(); // Prevent default
             submitScore();
         }
     }
}

function toggleManufacturerList() {
    const isHidden = DOMElements.manufacturerListContainer.classList.toggle('hidden');
    if (!isHidden) { // Only populate if becoming visible
         if(allCoasters.length === 0) {
             DOMElements.manufacturerListContainer.innerHTML = "Coaster data not loaded yet.";
             return;
         }
         try {
            // Use flatMap to get all names from aliases, then Set for uniqueness
            const uniqueManufacturers = [...new Set(allCoasters.flatMap(c => c.manufacturer))].sort(
                (a, b) => a.toLowerCase().localeCompare(b.toLowerCase()) // Case-insensitive sort
            );
            DOMElements.manufacturerListContainer.innerHTML = "<strong>Manufacturers in Data:</strong><br>" + uniqueManufacturers.map(m => escapeHtml(m)).join('<br>');
         } catch(e) {
            DOMElements.manufacturerListContainer.innerHTML = "Error loading manufacturer list.";
            console.error("Error processing manufacturers for list:", e);
         }
    }
}


// --- Local Storage Persistence ---
function saveLocalSettings() {
    // Saves Personal Best and Guess Times Array
    localStorage.setItem('personalBestStreak', personalBestStreak.toString());
    localStorage.setItem('correctGuessTimes', JSON.stringify(correctGuessTimes));
    // Dark mode saved in its toggle function
    // Last player name saved in submitScore function
}

// --- Leaderboard Interaction (Google Apps Script) ---
function checkAndPromptForLeaderboard(finalStreak) {
    // Only prompt if the streak score is positive and the API URL looks configured
    if (finalStreak > 0 && LEADERBOARD_API_URL.startsWith('https://script.google.com')) {
        console.log(`Streak of ${finalStreak} ended. Prompting for leaderboard submission.`);
        DOMElements.submitScoreArea.classList.remove('hidden'); // Show the input area
        DOMElements.submitScoreArea.dataset.scoreToSubmit = finalStreak; // Store score temporarily
        DOMElements.playerNameInput.value = lastSubmittedName; // Pre-fill last used name
        DOMElements.playerNameInput.focus(); // Focus the name input
    } else if (finalStreak > 0) {
        console.warn("Leaderboard URL seems incorrect/not configured. Skipping prompt.");
        // Optionally inform user: DOMElements.result.textContent += " (Leaderboard unavailable)";
    }
}

async function submitScore() {
    const name = DOMElements.playerNameInput.value.trim();
    const score = parseInt(DOMElements.submitScoreArea.dataset.scoreToSubmit || '0', 10);

    // Client-side validation
    if (!name) { alert("Please enter a name."); return; }
    if (score <= 0) { alert("Cannot submit score of 0."); return; }
    if (name.length > 15) { alert("Name is too long (max 15 characters)."); return; }

    DOMElements.submitScoreButton.disabled = true;
    DOMElements.submitScoreButton.textContent = "Submitting...";

    try {
        const response = await fetch(LEADERBOARD_API_URL, {
            method: 'POST',
            mode: 'cors', // Essential for cross-origin request to Apps Script
            cache: 'no-cache', // Prevent potential caching issues
            headers: {
                // Sending as text/plain often works best with default e.postData.contents in Apps Script
                'Content-Type': 'text/plain;charset=utf-8',
            },
            body: JSON.stringify({ name: name, score: score }), // The data still needs to be JSON format *within* the body
            redirect: 'follow' // Let the browser handle redirects if Apps Script sends them
        });

        // Need to check response carefully, Apps Script can be tricky
        let result;
        try {
             // Try to parse response as JSON, which our updated Apps Script should return
             result = await response.json();
        } catch (e) {
             // If parsing fails, maybe it wasn't JSON (e.g., HTML error page from GAS?)
             console.error("Failed to parse leaderboard response as JSON.", e);
             // Attempt to get text response for debugging
             const textResponse = await response.text();
             console.error("Raw response text:", textResponse);
             throw new Error(`Received unexpected response from server (Status: ${response.status}). Check console for details.`);
        }

        // Check the success flag from our Apps Script JSON response
        if (!result.success) {
             throw new Error(result.error || "Unknown error from leaderboard server.");
        }

        // Success!
        console.log("Leaderboard submit success:", result.message || "Score submitted!");
        DOMElements.submitScoreArea.classList.add('hidden'); // Hide the input area
        DOMElements.playerNameInput.value = name; // Keep name in input field maybe? Or clear it? Clearing is probably better.
        DOMElements.playerNameInput.value = '';

        lastSubmittedName = name; // Remember the name used successfully
        localStorage.setItem('lastPlayerName', name); // Save for next time

        fetchLeaderboard(); // Refresh leaderboard view to show new/updated score

    } catch (error) {
        console.error("Error submitting score:", error);
        // Display a user-friendly error message, including the specific error if available
        alert(`Submission Failed: ${error.message}\n\nPlease check your connection and the name you entered. Make sure the leaderboard URL is correctly configured.`);
    } finally {
        // Re-enable the button regardless of success/failure
        DOMElements.submitScoreButton.disabled = false;
        DOMElements.submitScoreButton.textContent = "Submit Score";
    }
}


async function fetchLeaderboard() {
    // Only fetch if the URL looks like a valid Apps Script URL
    if (!LEADERBOARD_API_URL || !LEADERBOARD_API_URL.startsWith('https://script.google.com')) {
        console.warn("fetchLeaderboard called but LEADERBOARD_API_URL is not configured correctly.");
        DOMElements.leaderboardList.innerHTML = '<li>Leaderboard is not available (URL missing).</li>';
        DOMElements.refreshLeaderboardButton.disabled = true;
        return;
    }

    DOMElements.leaderboardList.innerHTML = '<li><span class="loading"></span> Fetching scores...</li>'; // Show loading state
    DOMElements.refreshLeaderboardButton.disabled = true; // Disable refresh while fetching

    try {
        // Add a cache-busting query parameter
        const url = `${LEADERBOARD_API_URL}?cachebust=${Date.now()}`;
        const response = await fetch(url, { method: 'GET', mode: 'cors', cache: 'no-cache'});

        if (!response.ok) {
            // Handle non-2xx responses more gracefully
             throw new Error(`Leaderboard fetch failed! Status: ${response.status} ${response.statusText}`);
        }

        let result;
        try {
             result = await response.json(); // Expecting JSON from our doGet
        } catch(e) {
             console.error("Failed to parse leaderboard response as JSON.", e);
              const textResponse = await response.text();
             console.error("Raw leaderboard response text:", textResponse);
             throw new Error("Received unexpected response format from leaderboard server.");
        }


        if (!result.success || !Array.isArray(result.data)) {
            // Handle errors reported by the Apps Script itself
            throw new Error(result.error || "Invalid data received from leaderboard server.");
        }

        renderLeaderboard(result.data); // Render the fetched data

    } catch (error) {
        console.error("Error fetching leaderboard:", error);
        DOMElements.leaderboardList.innerHTML = `<li>⚠️ Error loading scores: ${escapeHtml(error.message)}</li>`; // Show error in the list
    } finally {
         DOMElements.refreshLeaderboardButton.disabled = false; // Re-enable refresh button
    }
}

function renderLeaderboard(data) {
    DOMElements.leaderboardList.innerHTML = ''; // Clear previous list (or loading indicator)
    if (!data || data.length === 0) {
        DOMElements.leaderboardList.innerHTML = '<li>No high scores yet. Play to be the first!</li>';
        return;
    }
    // Sort client-side just in case API didn't guarantee order (optional, API should handle it)
    // data.sort((a, b) => (b.score || 0) - (a.score || 0));

    data.forEach((entry, index) => {
        const listItem = document.createElement('li');
        const score = parseInt(entry.score, 10) || 0; // Ensure score is number
        const name = entry.name || "Anonymous";
        listItem.innerHTML = `
            <span>${index + 1}. <span class="leader-name">${escapeHtml(name)}</span></span>
            <span class="leader-score">${score} 🔥</span>
        `;
        DOMElements.leaderboardList.appendChild(listItem);
    });
}

// --- Utility Functions ---
function escapeHtml(unsafe) {
    // Basic HTML escaping to prevent XSS from player names or potentially coaster data
    if (typeof unsafe !== 'string') return unsafe; // Return non-strings as is
    return unsafe
         .replace(/&/g, "&")
         .replace(/</g, "<")
         .replace(/>/g, ">")
         .replace(/'/g, "'");
}
