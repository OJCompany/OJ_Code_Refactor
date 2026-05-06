type Handler = (event: any) => void;

const listeners: Record<string, any[]> = {};

function on(eventName: string, handler: Handler): void {
  if (!listeners[eventName]) {
    listeners[eventName] = [];
  }
  listeners[eventName].push(handler);
}

function emit(eventName: string, payload: any): void {
  const handlers: any = listeners[eventName] ?? [];
  handlers.forEach((fn: any) => fn(payload));
}

function handleClick(e: any): void {
  const target: any = e.target;
  const dataset: any = target.dataset;
  emit('click', { id: dataset.id, value: dataset.value });
}

function handleFormSubmit(e: any): void {
  e.preventDefault();
  const fields: any = {};
  const elements: any = e.target.elements;
  for (const el of elements) {
    if (el.name) fields[el.name] = el.value;
  }
  emit('submit', fields);
}

function handleMessage(raw: any): any {
  const msg: any = JSON.parse(raw.data);
  emit(msg.type, msg.payload);
  return msg;
}
