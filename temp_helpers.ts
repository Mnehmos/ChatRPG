/**
 * Verbosity level type for encounter formatting.
 */
type VerbosityLevel = 'minimal' | 'summary' | 'standard' | 'detailed';

/**
 * Format a single participant row based on verbosity level.
 * Extracts shared formatting logic used across different encounter displays.
 *
 * @param participant - The participant to format
 * @param detail - Verbosity level controlling how much information to show
 * @param encounterId - The encounter ID (needed for death saves and conditions)
 * @param index - The participant's position in initiative order
 * @param isCurrent - Whether this is the current turn participant
 * @returns Formatted participant row(s) as an array of strings
 */
function formatParticipantRow(
  participant: EncounterParticipant,
  detail: VerbosityLevel,
  encounterId: string,
  index: number,
  isCurrent: boolean
): string[] {
  const lines: string[] = [];
  const maxHp = participant.maxHp || participant.hp;

  if (detail === 'summary') {
    // Summary: HP bar with percentage and status indicator
    const hpPercent = Math.round((participant.hp / maxHp) * 100);
    const hpBar = createMiniHpBar(participant.hp, maxHp, HP_BAR_WIDTH.SUMMARY);
    const turnMarker = isCurrent ? '▶ ' : '  ';
    const status = getStatusIndicator(participant.hp, maxHp);
    const line = `${turnMarker}${participant.name}: [${hpBar}] ${hpPercent}%${status}`;
    lines.push(padText(line, ENCOUNTER_WIDTH, 'left'));
  } else if (detail === 'standard') {
    // Standard: Initiative order table format with full stats
    const marker = isCurrent ? '▶' : ' ';
    const order = String(index + 1).padStart(2);
    const name = participant.name.substring(0, 14).padEnd(14);
    const init = String(participant.initiative).padStart(4);
    const hpStr = `${participant.hp}/${maxHp}`.padStart(9);
    const acStr = String(participant.ac).padStart(3);

    // Get conditions for this participant
    const conditions = getActiveConditions(participant.id);
    const condStr = conditions.length > 0
      ? conditions.map(c => c.condition).join(', ')
      : '-';

    // Build main stat line
    const line = `${marker} ${order} ${name} ${init} ${hpStr} ${acStr}  ${condStr}`;
    lines.push(line);

    // Show position if available
    if (participant.position) {
      lines.push(`      📍 (${participant.position.x}, ${participant.position.y})${participant.position.z ? ` ${participant.position.z}ft up` : ''}`);
    }

    // Show death save state if at 0 HP
    if (participant.hp === 0) {
      const deathDisplay = formatDeathSaveDisplay(encounterId, participant.id);
      if (deathDisplay) {
        lines.push(`      ${deathDisplay}`);
      }
    }
  } else if (detail === 'detailed') {
    // Detailed: Full character sheet with all stats
    const marker = isCurrent ? String.fromCodePoint(0x25B6) : ' ';
    const persistMarker = (participant as any).characterId ? '(persistent)' : '(ephemeral)';
    lines.push(padText(`${marker} ${index + 1}. ${participant.name} ${persistMarker}`, ENCOUNTER_WIDTH, 'left'));

    // Stats line with HP bar
    const hpBar = createMiniHpBar(participant.hp, maxHp, HP_BAR_WIDTH.DETAILED);
    lines.push(padText(`   HP: ${hpBar} ${participant.hp}/${maxHp}  AC: ${participant.ac}  Init: ${participant.initiative}`, ENCOUNTER_WIDTH, 'left'));

    // Speed
    lines.push(padText(`   Speed: ${participant.speed || 30}ft`, ENCOUNTER_WIDTH, 'left'));

    // Position
    if (participant.position) {
      const posStr = `   Position: (${participant.position.x}, ${participant.position.y})${participant.position.z ? ` elevation ${participant.position.z}ft` : ''}`;
      lines.push(padText(posStr, ENCOUNTER_WIDTH, 'left'));
    }

    // Resistances/Immunities/Vulnerabilities
    if (participant.resistances && participant.resistances.length > 0) {
      lines.push(padText(`   Resist: ${participant.resistances.join(', ')}`, ENCOUNTER_WIDTH, 'left'));
    }
    if (participant.immunities && participant.immunities.length > 0) {
      lines.push(padText(`   Immune: ${participant.immunities.join(', ')}`, ENCOUNTER_WIDTH, 'left'));
    }
    if (participant.vulnerabilities && participant.vulnerabilities.length > 0) {
      lines.push(padText(`   Vulnerable: ${participant.vulnerabilities.join(', ')}`, ENCOUNTER_WIDTH, 'left'));
    }

    // Conditions
    const conditions = getActiveConditions(participant.id);
    if (conditions.length > 0) {
      lines.push(padText('   Conditions:', ENCOUNTER_WIDTH, 'left'));
      for (const c of conditions) {
        let condLine = `     • ${c.condition}`;
        if (c.duration && typeof c.duration === 'number') condLine += ` (${c.duration} rounds)`;
        else if (c.duration) condLine += ` (${c.duration})`;
        if (c.source) condLine += ` [${c.source}]`;
        lines.push(padText(condLine, ENCOUNTER_WIDTH, 'left'));
      }
    }

    // Death save state
    if (participant.hp === 0) {
      const deathDisplay = formatDeathSaveDisplay(encounterId, participant.id);
      if (deathDisplay) {
        lines.push(padText(`   ${deathDisplay}`, ENCOUNTER_WIDTH, 'left'));
      }
    }

    lines.push(''); // Space between participants
  }

  return lines;
}

/**
 * Format a list of participants based on verbosity level.
 * Consolidates participant formatting logic shared across encounter displays.
 *
 * @param participants - Array of participants to format
 * @param detail - Verbosity level controlling how much information to show
 * @param encounterId - The encounter ID (needed for death saves and conditions)
 * @param currentTurnIndex - Index of the current turn participant
 * @returns Array of formatted content lines
 */
function formatParticipantList(
  participants: EncounterParticipant[],
  detail: VerbosityLevel,
  encounterId: string,
  currentTurnIndex: number
): string[] {
  const content: string[] = [];

  if (detail === 'summary') {
    // Summary: Simple list with HP bars
    content.push('─'.repeat(ENCOUNTER_WIDTH));
    content.push(centerText(`COMBATANTS (${participants.length})`, ENCOUNTER_WIDTH));
    content.push('─'.repeat(ENCOUNTER_WIDTH));

    for (const p of participants) {
      const isCurrent = p.id === participants[currentTurnIndex].id;
      content.push(...formatParticipantRow(p, detail, encounterId, 0, isCurrent));
    }
  } else if (detail === 'standard') {
    // Standard: Initiative order table
    content.push('INITIATIVE ORDER:');
    content.push('─'.repeat(ENCOUNTER_WIDTH));
    content.push('  # Name            Init  HP        AC  Conditions');
    content.push('─'.repeat(ENCOUNTER_WIDTH));

    for (let i = 0; i < participants.length; i++) {
      const isCurrent = i === currentTurnIndex;
      content.push(...formatParticipantRow(participants[i], detail, encounterId, i, isCurrent));
    }
  } else if (detail === 'detailed') {
    // Detailed: Full participant details
    content.push(padText('COMBATANTS:', ENCOUNTER_WIDTH, 'left'));
    content.push('─'.repeat(ENCOUNTER_WIDTH));

    for (let i = 0; i < participants.length; i++) {
      const isCurrent = i === currentTurnIndex;
      content.push(...formatParticipantRow(participants[i], detail, encounterId, i, isCurrent));
    }
  }

  return content;
}
