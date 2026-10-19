import { creation, refuse } from './protocol-contract.mjs';

function ownedCreation(reply, sessions, profile, core) {
  const sessionId = creation(reply, profile.platform, profile.caps);
  const registeredId = creation({ ...reply, structuredContent: { ...reply.structuredContent, sessions } }, profile.platform, profile.caps);
  const info = core.getSessionInfo(sessionId);
  if (registeredId !== sessionId || !info || info.sessionId !== sessionId || info.ownership !== 'owned' || !info.driver) refuse('INVALID_CREATION_RESULT');
  return info;
}

export function closedDispatchGate(journal) {
  return { name: 'jev-closed-dispatch-gate', version: '0.1.0', beforeCall(ctx) {
    if (!ctx.toolName.startsWith('jev_phase1_') && journal('inspect').closed) return { isError: true, content: [{ type: 'text', text: 'DISPATCH_CLOSED' }] };
  } };
}

export function createLiveProtocolLedger({ profile, journal, io }) {
  let sequence = 0, core;
  const commands = new WeakMap();
  return { name: 'jev-live-protocol-ledger', version: '0.1.0', register(_registry, availableCore) { core = availableCore; io.captureOwner(); }, beforeCall(ctx) {
    if (ctx.toolName.startsWith('jev_phase1_')) return;
    const id = 'command-' + (++sequence);
    const authorized = journal('authorize', { id, tool: ctx.toolName, arguments: ctx.args });
    if (!authorized.accepted) return { isError: true, content: [{ type: 'text', text: authorized.reason }] };
    commands.set(ctx, id); io.enableDebugLogging(); io.captureOwner();
  }, async afterCall(ctx, reply) {
    if (ctx.toolName.startsWith('jev_phase1_')) return;
    io.persist('native-return.json', { id: commands.get(ctx), tool: ctx.toolName, nativeReturned: true, isError: reply.isError, time: io.now() });
    const done = journal('complete', { id: commands.get(ctx) });
    const isCreation = ctx.toolName === 'appium_session_management' && ctx.args.action === 'create';
    const created = isCreation && !reply.isError ? ownedCreation(reply, core.listSessions(), profile, core) : undefined;
    if (created) {
      const info = created;
      io.persist('native-runtime.json', io.observeCreatedSession(info));
    }
    io.persist('actual-loaded.json', io.loadedModules());
    const owner = io.captureOwner();
    const sessions = core.listSessions();
    io.persist('inventory.json', { sessions, serverPid: io.serverPid, owner });
    if (!done.accepted) return { isError: true, content: [{ type: 'text', text: done.reason }] };
    const lostCreation = profile.faultMode === 'lost-create' && created !== undefined;
    if (lostCreation) ownedCreation(reply, sessions, profile, core);
    if (lostCreation || (['lost-action', 'late-action'].includes(profile.faultMode) && ctx.toolName === 'appium_gesture')) {
      io.persist('fault-barrier.json', { mode: profile.faultMode, id: commands.get(ctx), tool: ctx.toolName, nativeReturned: true });
      await io.waitForFault(profile.faultMode);
      if (profile.faultMode === 'late-action') io.persist('late-reply.json', { id: commands.get(ctx), time: io.now() });
    }
    return reply;
  } };
}
