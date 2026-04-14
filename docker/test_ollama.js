async function test() {
  const toolCallMsg = {
    role: 'assistant',
    content: '',
    tool_calls: [
      { id: 'call_test_1', type: 'function', function: { name: 'bash', arguments: JSON.stringify({command: 'ls /workspace'}) } }
    ]
  };
  const toolResultMsg = {
    role: 'tool',
    tool_call_id: 'call_test_1',
    content: JSON.stringify({ output: 'README.md\ndemo-file.txt', exit_code: 0, cwd: '/workspace' })
  };
  const body = {
    model: process.env.GENESIS_MODEL || 'gemma4:e4b',
    messages: [
      { role: 'user', content: 'list files in /workspace using bash' },
      toolCallMsg,
      toolResultMsg
    ],
    stream: false
  };
  const json = JSON.stringify(body);
  console.log('Body size:', json.length);
  console.log('Checking arguments field:', typeof toolCallMsg.tool_calls[0].function.arguments, toolCallMsg.tool_calls[0].function.arguments);
  const res = await fetch('http://ollama:11434/api/chat', {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: json, signal: AbortSignal.timeout(45000)
  });
  console.log('Status:', res.status);
  if (!res.ok) {
    const err = await res.text();
    console.log('Error:', err);
    // Now try with arguments as object instead of string
    console.log('\n--- Retrying with arguments as OBJECT ---');
    toolCallMsg.tool_calls[0].function.arguments = {command: 'ls /workspace'};
    const body2 = {...body, messages: [body.messages[0], toolCallMsg, toolResultMsg]};
    const res2 = await fetch('http://ollama:11434/api/chat', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body2), signal: AbortSignal.timeout(45000)
    });
    console.log('Status2:', res2.status);
    if (!res2.ok) console.log('Error2:', await res2.text());
    else { const r2 = await res2.json(); console.log('OK2 - content:', (r2.message && r2.message.content || '').slice(0,100)); }
  }
  else { const r = await res.json(); console.log('OK - content:', (r.message && r.message.content || '').slice(0,100)); }
}
test().catch(e => console.error(e.message));
