// Cookie utility functions for chat history persistence
function setCookie(name, value, days) {
    const expires = new Date();
    expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
    document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires.toUTCString()};path=/`;
}

function getCookie(name) {
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) === ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) === 0) return decodeURIComponent(c.substring(nameEQ.length, c.length));
    }
    return null;
}

// Utility function to scroll chat to bottom
function scrollChatToBottom() {
    const scrollContainer = document.querySelector('.aiScroll');
    if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
    }
}

function saveChatHistory() {
    const chatHistory = document.getElementById("chatHistory");
    if (!chatHistory) return;
    
    const messages = Array.from(chatHistory.children).map(message => {
        const isUserMessage = message.classList.contains("user-message");
        const isTypingIndicator = message.id === "ai-typing-indicator";
        const isLoadingAnimation = message.classList.contains("loading-animation");
        const isErrorMessage = message.classList.contains("error-message");
        const isErrorTrigger = message.hasAttribute("data-error-trigger");
        
        // Skip typing indicators, loading animations, error messages, and messages that triggered errors
        if (isTypingIndicator || isLoadingAnimation || isErrorMessage || isErrorTrigger) return null;
        
        // Check if this is an AI response with error content
        const content = message.textContent.trim();
        const hasErrorContent = content.includes("⚠️") || content.includes("❌") || content.includes("🌐") || 
                               content.includes("API rate limit") || content.includes("Netwerkfout") || 
                               content.includes("Er is iets misgegaan");
        
        if (hasErrorContent) return null;
        
        return {
            type: isUserMessage ? "user" : "ai",
            content: content,
            html: message.innerHTML
        };
    }).filter(msg => msg !== null);
    
    // Save to cookie (limit to last 20 messages to avoid cookie size issues)
    const recentMessages = messages.slice(-20);
    setCookie('chatHistory', JSON.stringify(recentMessages), 7); // 7 days
}

function loadChatHistory() {
    const chatHistory = document.getElementById("chatHistory");
    if (!chatHistory) return;
    
    const savedHistory = getCookie('chatHistory');
    if (!savedHistory) return;
    
    try {
        const messages = JSON.parse(savedHistory);
        chatHistory.innerHTML = ''; // Clear existing history
        
        messages.forEach(msg => {
            const messageElement = document.createElement("div");
            messageElement.className = msg.type === "user" ? "chat-bubble user-message" : "chat-bubble ai-response";
            messageElement.innerHTML = msg.html;
            chatHistory.appendChild(messageElement);
        });
        
        // Scroll to bottom - use the correct scrollable container
        scrollChatToBottom();
    } catch (error) {
        console.error('Error loading chat history:', error);
    }
}

// Function to parse Markdown-like syntax
function parseMarkdown(text) {
    // Replace *text* with <strong>text</strong> for bold
    return text.replace(/\*(.*?)\*/g, "<strong>$1</strong>");
}

async function askMistral(userMessage) {
    const chatHistory = document.getElementById("chatHistory");
    const inputBox = document.getElementById("userInput");
    const sendButton = document.getElementById("send-button");

    if (userMessage.trim() === "") {
        const errorMessage = document.createElement("div");
        errorMessage.className = "chat-bubble ai-response";
        errorMessage.textContent = "Please enter a message first!";
        chatHistory.appendChild(errorMessage);
        return;
    }

    // Clean up any previous error messages when starting a new conversation
    cleanupErrorMessages();

    // ⏳ Disable sending (but allow typing) and update the button
    inputBox.readOnly = false; // Keep input enabled for typing
    sendButton.innerText = "Genereren...";
    sendButton.disabled = true; // Disable send button only

    // Append user message to chat history
    const userMessageElement = document.createElement("div");
    userMessageElement.className = "chat-bubble user-message";
    userMessageElement.textContent = userMessage;
    chatHistory.appendChild(userMessageElement);

    // Scroll to the bottom after user message is added
    scrollChatToBottom();

    // Add loading animation for AI response
    const loadingElement = document.createElement("div");
    loadingElement.className = "chat-bubble ai-response loading-animation";

    const spinner = document.createElement("div");
    spinner.className = "spinner"; // Ensure the spinner class is added
    loadingElement.appendChild(spinner);

    chatHistory.appendChild(loadingElement);

    // Scroll to the bottom after loading animation is added
    scrollChatToBottom();

    // Load website content summary
    let websiteContent = '';
    try {
        const response = await fetch('../data/website_content_summary.txt');
        websiteContent = await response.text();
    } catch (error) {
        console.log('Could not load website content summary:', error);
        websiteContent = 'Je bent een AI assistent voor GTI Beveren, richting Applicatie- en Databeheer (5ADB). Antwoord altijd in het Nederlands.';
    }

    // Collect the full chat history
    const chatMessages = Array.from(chatHistory.children)
        .map((message) => {
            const isUserMessage = message.classList.contains("user-message");
            const role = isUserMessage ? "User" : "AI";
            return `${role}: ${message.textContent.trim()}`;
        })
        .join("\n");

    // Function to make API request with retry logic
    const makeApiRequest = async (retryCount = 0) => {
        try {
            const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer HSLCZmOYODm8hW0fAfz2TdIYSpdMZYdw" // 🔴 Replace with a secure method!
                },
                body: JSON.stringify({
                    model: "mistral-large-2411",
                    stream: true, // Enable streaming
                    messages: [
                        { role: "system", content: "Antwoord altijd in het Nederlands." },
                        { role: "system", content: "Je bent een AI assistent voor GTI Beveren, richting Applicatie- en Databeheer (5ADB). Antwoord altijd vriendelijk en behulpzaam, maar houd je antwoorden kort en gericht. Gebruik de onderstaande informatie om vragen te beantwoorden:" },
                        { role: "system", content: websiteContent },
                        { role: "system", content: "Belangrijke regels: (1) Antwoord altijd in het Nederlands. (2) Houd antwoorden kort en gericht - lange antwoorden zijn saai voor gebruikers. (3) Gebruik alleen de informatie uit de website content summary. (4) Vertel altijd alles in je eigen woorden. (5) De vragen komen van leerlingen/toekomstige leerlingen van GTI Beveren." },
                        { role: "system", content: "Chat-History:\n" + chatMessages },
                        { role: "user", content: userMessage }

                    ],
                })
            });

            // Handle rate limiting (429 error)
            if (response.status === 429) {
                if (retryCount < 3) { // Max 3 retries
                    const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff: 1s, 2s, 4s
                    console.log(`Rate limited. Retrying in ${delay/1000} seconds...`);
                    
                    // Update loading message to show retry
                    if (chatHistory.contains(loadingElement)) {
                        // Clear the loading element and add retry message
                        loadingElement.innerHTML = '';
                        loadingElement.className = "chat-bubble ai-response";
                        loadingElement.textContent = `⏳ Rate limit bereikt. Opnieuw proberen in ${delay/1000} seconden...`;
                    }
                    
                    await new Promise(resolve => setTimeout(resolve, delay));
                    return makeApiRequest(retryCount + 1);
                } else {
                    throw new Error('Rate limit exceeded. Please try again later.');
                }
            }

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return response;
        } catch (error) {
            if (retryCount < 3 && (error.name === 'TypeError' || error.message.includes('fetch'))) {
                const delay = Math.pow(2, retryCount) * 1000;
                console.log(`Network error. Retrying in ${delay/1000} seconds...`);
                
                // Update loading message to show network retry
                if (chatHistory.contains(loadingElement)) {
                    loadingElement.innerHTML = '';
                    loadingElement.className = "chat-bubble ai-response";
                    loadingElement.textContent = `🌐 Netwerkfout. Opnieuw proberen in ${delay/1000} seconden...`;
                }
                
                await new Promise(resolve => setTimeout(resolve, delay));
                return makeApiRequest(retryCount + 1);
            }
            throw error;
        }
    };

    try {
        const response = await makeApiRequest();

        // Remove loading animation
        chatHistory.removeChild(loadingElement);
        
        // Create a separate typing indicator that stays visible during entire generation
        const typingIndicator = document.createElement("div");
        typingIndicator.id = "ai-typing-indicator";
        typingIndicator.className = "typing-indicator";
        typingIndicator.innerHTML = "🤖 AI is typing...";
        chatHistory.appendChild(typingIndicator);
        
        // Create AI response element (empty at first)
        const aiResponseElement = document.createElement("div");
        aiResponseElement.className = "chat-bubble ai-response";
        aiResponseElement.innerHTML = ""; // Start empty
        chatHistory.appendChild(aiResponseElement);
        
        // Scroll to the bottom
        scrollChatToBottom();

        // Handle streaming response
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullResponse = "";
        let isFirstChunk = true;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6).trim();
                    if (data === '[DONE]') {
                        break;
                    }

                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.choices && parsed.choices[0].delta && parsed.choices[0].delta.content) {
                            const content = parsed.choices[0].delta.content;
                            fullResponse += content;
                            
                            // Update the AI response element with streaming content
                            aiResponseElement.innerHTML = parseMarkdown(fullResponse);
                            
                            // Auto-scroll to bottom to follow the streaming text
                            scrollChatToBottom();
                        }
                    } catch (e) {
                        // Skip invalid JSON lines
                        continue;
                    }
                }
            }
        }

        // Final update with complete response
        aiResponseElement.innerHTML = parseMarkdown(fullResponse);
        
        // Final scroll to bottom
        scrollChatToBottom();
        
        // Remove the typing indicator now that AI is done
        const typingIndicatorElement = document.getElementById("ai-typing-indicator");
        if (typingIndicatorElement) {
            typingIndicatorElement.remove();
        }

        // Save chat history to cookie
        saveChatHistory();

    } catch (error) {
        console.error("API Error:", error);

        // Remove loading animation if it still exists
        if (chatHistory.contains(loadingElement)) {
            chatHistory.removeChild(loadingElement);
        }

        const errorResponseElement = document.createElement("div");
        errorResponseElement.className = "chat-bubble ai-response error-message";
        
        // Provide user-friendly error messages
        if (error.message.includes('Rate limit exceeded')) {
            errorResponseElement.textContent = "⚠️ Te veel verzoeken op dit moment. Probeer het over een paar minuten opnieuw.";
        } else if (error.message.includes('HTTP error! status: 429')) {
            errorResponseElement.textContent = "⚠️ API rate limit bereikt. Wacht even voordat je een nieuwe vraag stelt.";
        } else if (error.message.includes('fetch') || error.name === 'TypeError') {
            errorResponseElement.textContent = "🌐 Netwerkfout. Controleer je internetverbinding en probeer opnieuw.";
        } else {
            errorResponseElement.textContent = "❌ Er is iets misgegaan. Probeer het opnieuw.";
        }
        
        // Mark the user message that triggered this error
        userMessageElement.setAttribute("data-error-trigger", "true");
        
        chatHistory.appendChild(errorResponseElement);
        
        // Scroll to bottom
        scrollChatToBottom();
        
        // Remove the typing indicator if there's an error
        const typingIndicatorElement = document.getElementById("ai-typing-indicator");
        if (typingIndicatorElement) {
            typingIndicatorElement.remove();
        }

        // Don't save chat history when there's an error
    }

    // ✅ Reset the UI after the response (re-enable sending)
    inputBox.readOnly = false; // Keep input enabled
    sendButton.innerText = "Send";
    sendButton.disabled = false; // Re-enable send button
}

// Modify sendClicked to prevent sending while AI is generating
function sendClicked(userInput) {
    if (!userInput.trim()) return;
    
    // Check if send button is disabled (AI is generating)
    const sendButton = document.getElementById("send-button");
    if (sendButton.disabled) {
        return; // Don't send if AI is still generating
    }

    askMistral(userInput);

    // Clear input field
    document.getElementById("userInput").value = "";
}

function handleKeyPress(event) {
    if (event.key === "Enter") {
        event.preventDefault();
        
        // Check if send button is disabled (AI is generating)
        const sendButton = document.getElementById("send-button");
        if (sendButton.disabled) {
            return; // Don't send if AI is still generating
        }
        
        sendClicked(document.getElementById("userInput").value);
    }
}

let hasPrompted = false; // Flag to track if the prompt has been sent

// Show the tooltip
function showTooltip() {
    console.log("Tooltip function called"); // Debugging
    const tooltip = document.getElementById("aiTooltip");
    const tooltipShown = localStorage.getItem("tooltipShown");

    // Show the tooltip only if it hasn't been dismissed and the chatbot is not open
    if (tooltipShown) {
        setTimeout(() => {
            const chatModal = document.getElementById("chatModal");
            if (chatModal.style.display !== "flex") {
                console.log("Showing tooltip for the first time"); // Debugging
                tooltip.style.display = "flex";

                // Start repeating the tooltip every 10 seconds
                setInterval(() => {
                    if (chatModal.style.display !== "flex") {
                        console.log("Repeating tooltip every 10 seconds"); // Debugging
                        tooltip.style.display = "flex";
                    }
                }, 60000); // Repeat every 10 seconds
            }
        }, 2000); // Initial delay of 2 seconds
    }
}

// Hide the tooltip and mark it as dismissed
function hideTooltip() {
    const tooltip = document.getElementById("aiTooltip");
    tooltip.style.display = "none";

    // Store in localStorage to ensure it doesn't show again
    localStorage.setItem("tooltipShown", "true");
}

// 🎤 Open the chat
function openModal() {
    document.getElementById("chatModal").style.display = "flex";
    document.getElementById("overlay").style.display = "block";

    // Hide the tooltip if the chat is opened
    hideTooltip();

    // Load chat history from cookies
    loadChatHistory();

    // Check if there's any existing chat history
    const chatHistory = document.getElementById("chatHistory");
    const hasExistingHistory = chatHistory.children.length > 0;

    if (!hasPrompted && !hasExistingHistory) {
        let promptMessage = "Stel jezelf kort voor en vertel mij heel kort over de richting Applicatie- en Data-beheer in GTI Beveren.";
        askMistral(promptMessage);
        hasPrompted = true; // Set the flag to true after the first prompt
    }
}

// ❌ Close the chat
function closeModal() {
    document.getElementById("chatModal").style.display = "none";
    document.getElementById("overlay").style.display = "none";
}

// Call the tooltip function when the page loads
window.onload = () => {
    showTooltip();
    // Chat history will be loaded when modal opens
};

function clearChatHistory() {
    const chatHistory = document.getElementById("chatHistory");
    if (chatHistory) {
        chatHistory.innerHTML = '';
        setCookie('chatHistory', '', -1); // Delete the cookie
        hasPrompted = false; // Reset the prompt flag
    }
}

function cleanupErrorMessages() {
    const chatHistory = document.getElementById("chatHistory");
    if (!chatHistory) return;
    
    const errorMessages = chatHistory.querySelectorAll('.error-message');
    const errorTriggers = chatHistory.querySelectorAll('[data-error-trigger]');
    
    errorMessages.forEach(msg => msg.remove());
    errorTriggers.forEach(msg => {
        msg.removeAttribute('data-error-trigger');
    });
}
