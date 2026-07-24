// Simple in-memory history store.
// NOTE: This resets whenever the Railway service restarts/redeploys.

const MAX_ENTRIES_PER_CHAT = 10;
const historyByChat = new Map();

function addEntry(chatId, entry) {
  const list = historyByChat.get(chatId) || [];
  list.unshift({ ...entry, timestamp: Date.now() });
  if (list.length > MAX_ENTRIES_PER_CHAT) list.length = MAX_ENTRIES_PER_CHAT;
  historyByChat.set(chatId, list);
}

function getHistory(chatId) {
  return historyByChat.get(chatId) || [];
}

module.exports = { addEntry, getHistory };
