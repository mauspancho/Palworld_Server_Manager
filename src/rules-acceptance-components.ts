import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder
} from "discord.js";

export const rulesAcceptButtonId = "rules_accept";
export const rulesRejectButtonId = "rules_reject";

export function buildRulesPanelPayload(): { embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] } {
  return {
    embeds: buildRulesPanelEmbeds(),
    components: [buildRulesActionRow(false)]
  };
}

export function buildRulesPanelEmbeds(): EmbedBuilder[] {
  return [
    new EmbedBuilder()
      .setTitle("Reglas de la comunidad")
      .setDescription([
        "Bienvenido a XBOXPALSERVER, una comunidad de Palworld creada para jugar, convivir y ayudarnos entre todos.",
        "",
        "Lee estas reglas antes de participar. Al presionar Aceptar reglas confirmas que las leiste, las entiendes y te comprometes a respetarlas.",
        "",
        "Respeto entre miembros",
        "- Trata a todos con respeto.",
        "- No se permiten insultos graves, amenazas, acoso, discriminacion, provocaciones constantes, ataques personales ni burlas dirigidas a humillar.",
        "- Las bromas son validas mientras todas las personas involucradas esten de acuerdo.",
        "",
        "Contenido apropiado",
        "- No compartas contenido sexual o para adultos, imagenes extremadamente violentas, contenido ilegal, informacion privada, enlaces maliciosos, archivos sospechosos ni intentos de estafa.",
        "- Avatares, nombres y estados tambien deben respetar estas reglas."
      ].join("\n")),
    new EmbedBuilder()
      .setTitle("Uso correcto del servidor")
      .setDescription([
        "No hagas spam",
        "- Evita repetir mensajes, abusar de emojis, menciones o mayusculas.",
        "- No menciones innecesariamente a administradores o moderadores.",
        "- No publiques invitaciones, promociones, canales, transmisiones, productos o servicios fuera del canal correspondiente.",
        "",
        "Utiliza cada canal correctamente",
        "- Las dudas del juego van en ayuda.",
        "- Las busquedas de grupo van en buscar-grupo.",
        "- Las construcciones van en bases.",
        "- Los intercambios van en intercambios.",
        "- Los reportes deben enviarse en el canal destinado para soporte o moderacion.",
        "- Evita desviar constantemente el tema de los canales.",
        "",
        "Convivencia en voz",
        "- No grites ni reproduzcas sonidos molestos.",
        "- No uses modificadores de voz para incomodar.",
        "- No interrumpas constantemente.",
        "- Evita musica a volumen alto sin permiso del grupo.",
        "- Respeta cuando un grupo este organizando una raid o actividad."
      ].join("\n")),
    new EmbedBuilder()
      .setTitle("Palworld, intercambios y seguridad")
      .setDescription([
        "Trampas, abusos y exploits",
        "- No uses cheats, hacks ni programas externos para obtener ventajas.",
        "- No intentes evadir sanciones con cuentas alternativas.",
        "- No compartas herramientas disenadas para perjudicar el servidor.",
        "- Si descubres un error o exploit, reportalo en privado al equipo de administracion.",
        "",
        "Respeto dentro del servidor de Palworld",
        "- No destruyas, robes ni perjudiques bases de otros jugadores intencionalmente.",
        "- No bloquees zonas importantes, puntos de aparicion o accesos.",
        "- No sigas ni molestes repetidamente a otro jugador.",
        "- No uses nombres ofensivos para personajes, gremios o Pals.",
        "- No enganes durante intercambios ni te aproveches de jugadores nuevos.",
        "",
        "Intercambios",
        "- Confirma que recibira cada persona.",
        "- Revisa niveles, habilidades y caracteristicas.",
        "- Evita acuerdos ambiguos y guarda capturas cuando el intercambio sea importante.",
        "- Las estafas comprobadas pueden causar sanciones.",
        "",
        "Privacidad y seguridad",
        "- Nunca publiques contrasenas, direcciones, telefonos, datos bancarios, tokens, IP privadas ni informacion personal de terceros.",
        "- El equipo administrativo nunca pedira tu contrasena, token de Discord ni codigos de verificacion."
      ].join("\n")),
    new EmbedBuilder()
      .setTitle("Reportes, sanciones y aceptacion")
      .setDescription([
        "Reportes",
        "- No discutas reportes publicamente ni organices ataques contra otro usuario.",
        "- Incluye usuario, fecha, explicacion, capturas, videos, mensajes y canal o lugar dentro del juego cuando sea posible.",
        "- Los reportes falsos o manipulados tambien pueden ser sancionados.",
        "",
        "Suplantacion de identidad",
        "- No te hagas pasar por administradores, moderadores, creadores de contenido, otros miembros ni representantes oficiales de Palworld o Discord.",
        "",
        "Moderacion y sanciones",
        "- Las sanciones pueden ser advertencia, silencio temporal, expulsion, suspension temporal o baneo permanente.",
        "- Las faltas graves pueden recibir sancion directa sin advertencia previa.",
        "- Evadir una sancion con otra cuenta puede provocar el baneo de todas las cuentas relacionadas.",
        "",
        "Decisiones administrativas",
        "- El equipo puede intervenir cuando una conducta perjudique a la comunidad, incluso si no esta descrita literalmente aqui.",
        "- Las decisiones pueden apelarse con respeto mediante el canal de soporte.",
        "",
        "Cambios en las reglas",
        "- Las reglas pueden actualizarse cuando sea necesario. Los cambios importantes se publicaran en anuncios.",
        "",
        "Aceptacion",
        "- Confirmas que leiste las reglas, aceptas respetar a los demas y entiendes que incumplirlas puede generar sanciones.",
        "- Presiona Aceptar reglas para desbloquear el acceso a la comunidad."
      ].join("\n"))
  ];
}

export function buildRulesPromptEmbed(userId: string, rejectCount = 0): EmbedBuilder {
  const description = rejectCount === 0
    ? [
        `Hola <@${userId}>.`,
        "",
        "Para acceder al resto del servidor debes confirmar que leiste y aceptas estas reglas.",
        "",
        "Selecciona una opcion:"
      ].join("\n")
    : [
        rejectCount === 1
          ? "Has indicado que no aceptas las reglas del servidor."
          : "Las reglas son obligatorias para permanecer en el servidor.",
        "",
        rejectCount === 1
          ? "Para permanecer en esta comunidad es obligatorio aceptar las reglas. Si decides no aceptarlas, podras ser expulsado del servidor."
          : "Mientras no las aceptes, no tendras acceso a los canales generales y un administrador podra expulsarte del servidor.",
        "",
        "Revisa nuevamente las reglas y selecciona una opcion."
      ].join("\n");

  return new EmbedBuilder()
    .setTitle(rejectCount === 0 ? "Aceptacion de reglas" : "Reglas no aceptadas")
    .setDescription(description)
    .setTimestamp(new Date());
}

export function buildRulesAcceptedEmbed(userId: string, generalChatChannelId: string): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle("Reglas aceptadas")
    .setDescription([
      `<@${userId}> acepto correctamente las reglas del servidor.`,
      "",
      `Ir al chat general: <#${generalChatChannelId}>`
    ].join("\n"))
    .setTimestamp(new Date());
}

export function buildRulesActionRow(disabled = false): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(rulesAcceptButtonId)
      .setLabel("Aceptar reglas")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(rulesRejectButtonId)
      .setLabel("Rechazar reglas")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled)
  );
}

export function buildGeneralChatLinkRow(guildId: string, generalChatChannelId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel("Ir al chat general")
      .setStyle(ButtonStyle.Link)
      .setURL(`https://discord.com/channels/${guildId}/${generalChatChannelId}`)
  );
}
