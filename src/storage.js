// Keep preview and forms usable even when browser storage is disabled.
export function safeStorage(kind){
  const fallback=new Map();
  return {getItem(key){try{return globalThis[kind].getItem(key)??fallback.get(key)??null;}catch{return fallback.get(key)??null;}},setItem(key,value){fallback.set(key,String(value));try{globalThis[kind].setItem(key,String(value));}catch{}},removeItem(key){fallback.delete(key);try{globalThis[kind].removeItem(key);}catch{}}};
}
