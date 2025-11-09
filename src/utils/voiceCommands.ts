// Voice command parser and executor
// Maps natural language commands to actions

export type VoiceCommandAction = 
  | { type: 'navigate'; tab: 'map' | 'chat' | 'notifications' }
  | { type: 'ai_message'; message: string }
  | { type: 'search'; query: string; target: 'map' | 'chat' }
  | { type: 'location'; action: 'activate' | 'deactivate' }
  | { type: 'find_clinics'; type?: 'pharmacy' | 'clinic' | 'hospital' }
  | { type: 'unknown'; transcript: string };

export const parseVoiceCommand = (transcript: string): VoiceCommandAction => {
  const lower = transcript.toLowerCase().trim();
  
  // Navigation commands
  if (lower.match(/(?:deschide|arata|mergi la|du-ma la|vezi)\s+(?:harta|mapa|hartă)/i)) {
    return { type: 'navigate', tab: 'map' };
  }
  
  if (lower.match(/(?:deschide|arata|mergi la|du-ma la|vezi)\s+(?:chat|ai|asistent|asistentul)/i)) {
    return { type: 'navigate', tab: 'chat' };
  }
  
  if (lower.match(/(?:deschide|arata|mergi la|du-ma la|vezi)\s+(?:notificari|notificări|alerts)/i)) {
    return { type: 'navigate', tab: 'notifications' };
  }

  // AI message commands
  const aiMessageMatch = lower.match(/(?:intreaba|intreabă|spune|trimite|mesaj)\s+(?:ai|asistent|asistentul)[\s:]+(.+)/i);
  if (aiMessageMatch) {
    return { type: 'ai_message', message: aiMessageMatch[1].trim() };
  }

  // Direct questions to AI (if on chat tab or explicit)
  if (lower.match(/^(?:ce|cum|unde|de ce|cand|când|care|cat|cât)/i) || 
      lower.match(/(?:recomanda|recomandă|sugereaza|sugerează|ajuta|ajută)/i)) {
    return { type: 'ai_message', message: transcript };
  }

  // Location commands
  if (lower.match(/(?:activeaza|activează|porneste|pornește|arata|arată)\s+(?:locatia|locația|location|tracking)/i)) {
    return { type: 'location', action: 'activate' };
  }
  
  if (lower.match(/(?:opreste|oprește|dezactiveaza|dezactivează|stop)\s+(?:locatia|locatia|location|tracking)/i)) {
    return { type: 'location', action: 'deactivate' };
  }

  // Find clinics commands
  if (lower.match(/(?:gaseste|găsește|cauta|caută|arata|arată)\s+(?:farmacii|farmacie)/i)) {
    return { type: 'find_clinics', type: 'pharmacy' };
  }
  
  if (lower.match(/(?:gaseste|găsește|cauta|caută|arata|arată)\s+(?:clinici|clinica|clinică)/i)) {
    return { type: 'find_clinics', type: 'clinic' };
  }
  
  if (lower.match(/(?:gaseste|găsește|cauta|caută|arata|arată)\s+(?:spitale|spital)/i)) {
    return { type: 'find_clinics', type: 'hospital' };
  }

  // Search commands
  const searchMatch = lower.match(/(?:cauta|caută|gaseste|găsește|arata|arată)\s+(.+)/i);
  if (searchMatch && !searchMatch[1].match(/(?:farmacii|clinici|spitale)/i)) {
    return { type: 'search', query: searchMatch[1].trim(), target: 'map' };
  }

  // If no match, treat as AI message if it's a question or request
  if (lower.length > 10 && (
    lower.includes('?') || 
    lower.match(/(?:vreau|vrei|poti|poți|te rog|please)/i)
  )) {
    return { type: 'ai_message', message: transcript };
  }

  // Unknown command
  return { type: 'unknown', transcript };
};

