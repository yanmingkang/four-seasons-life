// Invitation copy is separate from event facts and never enters the journal.
export function fallbackInvitationMarkup(){
  return `<section class="journey-practice-invitation" data-practice-invitation="fallback" aria-labelledby="invitation-heading"><div class="invitation-intro"><img src="/characters/idle.gif" alt=""/><div><span>刘看山 · 沟通小练习</span><h3 id="invitation-heading">有句话，想先在这里试着说吗？</h3></div></div><p>面对同事甩锅，你会怎样回应？</p><small>独立假设情境 · 不计入本局经历 · 跳过不影响结局</small><div class="invitation-actions"><button type="button" id="invitation-practice-open" class="primary">试着说一句</button><button type="button" id="invitation-skip" class="secondary">继续旅行</button></div></section>`;
}
