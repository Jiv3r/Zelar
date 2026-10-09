import React, { useEffect, useRef, useState } from 'react';
import {
  Alert, Animated, Image, LayoutAnimation, Linking, Modal, Platform, Pressable,
  ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, UIManager, Vibration, View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import DateTimePicker from '@react-native-community/datetimepicker';
import ZelarIcone from './assets/zelar-icon.png';

const APP_NOME = 'Zelar';

// Alto contraste, fontes grandes e botões amplos (mín. 64 px)
const C = {
  bg: '#F7F4EC',    // creme suave, igual ao coração do ícone
  ink: '#123634',   // verde bem escuro, para textos
  main: '#0E6A69',  // verde-água do ícone (topo do degradê)
  deep: '#035253',  // verde mais escuro do ícone (base do degradê)
  sage: '#BFE0D6',  // verde claro suave, para destaques leves
  card: '#FFFFFF',
  line: '#D8E3DF',
  red: '#B3261E',
  gold: '#F2B705',
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true, shouldShowBanner: true, shouldShowList: true,
    shouldPlaySound: true, shouldSetBadge: false,
  }),
});

// Anima suavemente quando itens aparecem, somem ou o formulário abre/fecha
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
const animar = () => LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

// Canal padrão do Android com importância máxima e vibração forte, para a notificação
// se comportar o mais perto possível de um alarme mesmo com o app fechado
if (Platform.OS === 'android') {
  Notifications.setNotificationChannelAsync('default', {
    name: `${APP_NOME} — lembretes`,
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 600, 400, 600, 400, 600],
    sound: 'default',
    lightColor: C.red,
  });
}

const horaOk = (h) => /^([01]\d|2[0-3]):[0-5]\d$/.test(h);
const dataOk = (d) => /^(0[1-9]|[12]\d|3[01])\/(0[1-9]|1[0-2])$/.test(d);

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
// Formato "15/março/1950" em vez de "15/03/1950"
const dataAnoOk = (d) => new RegExp(`^(0[1-9]|[12]\\d|3[01])\\/(${MESES.join('|')})\\/(19|20)\\d{2}$`).test(d);
const fmtDataAno = (d) => `${String(d.getDate()).padStart(2, '0')}/${MESES[d.getMonth()]}/${d.getFullYear()}`;

// Máscara de telefone no padrão +55 (DD) 90000-0000, formatada enquanto a pessoa digita
const formatarTelefone = (bruto) => {
  let dig = (bruto || '').replace(/\D/g, '');
  if (dig.startsWith('55') && dig.length > 11) dig = dig.slice(2);
  dig = dig.slice(0, 11);
  if (!dig) return '';
  let out = `+55 (${dig.slice(0, 2)}`;
  if (dig.length >= 2) out += ') ';
  if (dig.length > 2) out += dig.slice(2, Math.min(7, dig.length));
  if (dig.length > 7) out += `-${dig.slice(7, 11)}`;
  return out;
};
// Valida o telefone ignorando o +55 fixo (precisa de DDD + pelo menos 8 dígitos)
const telefoneOk = (v) => {
  const dig = (v || '').replace(/\D/g, '');
  const semDDI = dig.startsWith('55') ? dig.slice(2) : dig;
  return semDDI.length >= 10;
};

// Dias da semana no padrão do Expo Notifications (1 = domingo ... 7 = sábado)
const DIAS_SEMANA = [
  { v: 1, letra: 'D', nome: 'Domingo' },
  { v: 2, letra: 'S', nome: 'Segunda' },
  { v: 3, letra: 'T', nome: 'Terça' },
  { v: 4, letra: 'Q', nome: 'Quarta' },
  { v: 5, letra: 'Q', nome: 'Quinta' },
  { v: 6, letra: 'S', nome: 'Sexta' },
  { v: 7, letra: 'S', nome: 'Sábado' },
];
const nomesDias = (dias) => dias.map((v) => DIAS_SEMANA.find((d) => d.v === v)?.nome).join(', ');

// Agenda um ou mais avisos: uma data única, dias da semana escolhidos, ou todo dia
async function agendarAvisos(titulo, corpo, hora, { diaMes, dias } = {}) {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return [];
  const [h, m] = hora.split(':').map(Number);
  const T = Notifications.SchedulableTriggerInputTypes;
  const conteudo = { content: { title: titulo, body: corpo, sound: true } };

  if (diaMes) {
    const trigger = { type: T.DATE, date: (() => { const [d, mo] = diaMes.split('/').map(Number); const dt = new Date(new Date().getFullYear(), mo - 1, d, h, m); if (dt < new Date()) dt.setFullYear(dt.getFullYear() + 1); return dt; })() };
    return [await Notifications.scheduleNotificationAsync({ ...conteudo, trigger })];
  }
  if (dias && dias.length > 0 && dias.length < 7) {
    return Promise.all(dias.map((weekday) =>
      Notifications.scheduleNotificationAsync({ ...conteudo, trigger: { type: T.WEEKLY, weekday, hour: h, minute: m } })));
  }
  return [await Notifications.scheduleNotificationAsync({ ...conteudo, trigger: { type: T.DAILY, hour: h, minute: m } })];
}

const cancelarAvisos = (nids) => (nids || []).forEach((id) => Notifications.cancelScheduledNotificationAsync(id));

function useArmazenado(chave) {
  const [itens, setItens] = useState([]);
  useEffect(() => { AsyncStorage.getItem(chave).then((s) => s && setItens(JSON.parse(s))); }, []);
  const salvar = (novo) => { setItens(novo); AsyncStorage.setItem(chave, JSON.stringify(novo)); };
  return [itens, salvar];
}

// Igual ao de cima, mas para um único objeto (não uma lista). `undefined` = ainda
// carregando do disco; `null` = carregou e não existe nada salvo ainda.
function useArmazenadoObjeto(chave) {
  const [valor, setValor] = useState(undefined);
  useEffect(() => { AsyncStorage.getItem(chave).then((s) => setValor(s ? JSON.parse(s) : null)); }, []);
  const salvar = (novo) => { setValor(novo); AsyncStorage.setItem(chave, JSON.stringify(novo)); };
  return [valor, salvar];
}

function Botao({ texto, onPress, cor = C.main, style }) {
  const escala = useRef(new Animated.Value(1)).current;
  const pressionar = (v) => Animated.spring(escala, { toValue: v, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  return (
    <Animated.View style={{ transform: [{ scale: escala }] }}>
      <Pressable accessibilityRole="button" accessibilityLabel={texto} onPress={onPress}
        onPressIn={() => pressionar(0.95)} onPressOut={() => pressionar(1)}
        style={[s.botao, { backgroundColor: cor }, style]}>
        <Text style={s.botaoTxt}>{texto}</Text>
      </Pressable>
    </Animated.View>
  );
}

// Botão da aba inferior, com um leve "pulo" ao ficar ativo
function AbaBotao({ icone, nome, ativo, onPress }) {
  const escala = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.spring(escala, { toValue: ativo ? 1.15 : 1, useNativeDriver: true, speed: 20, bounciness: 10 }).start();
  }, [ativo]);
  return (
    <TouchableOpacity accessibilityRole="tab" accessibilityLabel={nome} onPress={onPress}
      style={[s.aba, ativo && { backgroundColor: C.ink }]}>
      <Animated.Text style={{ fontSize: 26, transform: [{ scale: escala }] }}>{icone}</Animated.Text>
      <Text style={[s.abaTxt, ativo && { color: '#fff' }]}>{nome}</Text>
    </TouchableOpacity>
  );
}

const fmtHora = (d) => d.toTimeString().slice(0, 5);
const fmtData = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
const paraDate = (modo, v) => {
  if (modo === 'nascimento') {
    if (dataAnoOk(v || '')) {
      const [diaStr, mesNome, anoStr] = v.split('/');
      return new Date(Number(anoStr), MESES.indexOf(mesNome), Number(diaStr));
    }
    return new Date(1950, 0, 1); // ponto de partida razoável para rolar até o ano de nascimento
  }
  const d = new Date();
  if (modo === 'hora' && horaOk(v || '')) { const [h, m] = v.split(':').map(Number); d.setHours(h, m, 0, 0); }
  if (modo === 'data' && dataOk(v || '')) { const [dia, mes] = v.split('/').map(Number); d.setMonth(mes - 1, dia); }
  return d;
};

// Grava um item novo ou atualiza um existente (cancelando os avisos antigos)
const gravar = (itens, salvar, ed, novo) => {
  if (ed) {
    cancelarAvisos(ed.nids);
    salvar(itens.map((x) => (x.id === ed.id ? { ...x, ...novo } : x)));
  } else salvar([...itens, { id: String(Date.now()), ...novo }]);
};

// Seletor nativo de hora ou data (sem digitar)
function Seletor({ label, modo, valor, onChange }) {
  const [aberto, setAberto] = useState(false);
  const agora = () => (modo === 'hora' ? fmtHora(new Date()) : fmtData(new Date()));
  const mudou = (e, d) => {
    if (Platform.OS === 'android') setAberto(false);
    if (e.type === 'dismissed' || !d) return;
    if (modo === 'hora') onChange(fmtHora(d));
    else if (modo === 'nascimento') onChange(fmtDataAno(d));
    else onChange(fmtData(d));
  };
  const textoVazio = modo === 'hora' ? '🕒 Escolher horário' : modo === 'nascimento' ? 'Escolher data de nascimento' : '📆 Escolher dia';
  return (
    <View>
      <Text style={s.label}>{label}</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${label}: ${valor || 'escolher'}`}
        style={s.input} onPress={() => { if (!aberto && !valor && modo !== 'nascimento') onChange(agora()); setAberto(!aberto); }}>
        <Text style={{ fontSize: 24, color: valor ? C.ink : '#6B7C89' }}>{valor || textoVazio}</Text>
      </TouchableOpacity>
      {aberto && (
        <>
          <DateTimePicker value={paraDate(modo, valor)} mode={modo === 'hora' ? 'time' : 'date'} is24Hour
            locale="pt-BR" display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            maximumDate={modo === 'nascimento' ? new Date() : undefined} onChange={mudou} />
          {Platform.OS === 'ios' && <Botao texto="Pronto" onPress={() => setAberto(false)} style={{ minHeight: 52 }} />}
        </>
      )}
    </View>
  );
}

// Seletor de dias da semana (toque para marcar/desmarcar cada dia)
function SeletorDias({ label, valor, onChange }) {
  const dias = valor || [];
  const alternar = (v) => onChange(dias.includes(v) ? dias.filter((x) => x !== v) : [...dias, v].sort());
  return (
    <View>
      <Text style={s.label}>{label}</Text>
      <Text style={s.dica}>Deixe sem marcar nenhum dia para repetir todos os dias.</Text>
      <View style={s.linhaDias}>
        {DIAS_SEMANA.map((d) => {
          const marcado = dias.includes(d.v);
          return (
            <TouchableOpacity key={d.v} accessibilityRole="button" accessibilityState={{ selected: marcado }}
              accessibilityLabel={d.nome} onPress={() => alternar(d.v)}
              style={[s.diaBotao, marcado && { backgroundColor: C.main, borderColor: C.main }]}>
              <Text style={[s.diaTxt, marcado && { color: '#fff' }]}>{d.letra}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// Seletor de opções simples (ex.: só uma vez / toda semana)
function SeletorOpcoes({ label, valor, opcoes, onChange }) {
  return (
    <View>
      <Text style={s.label}>{label}</Text>
      <View style={s.linhaOpcoes}>
        {opcoes.map((o) => (
          <TouchableOpacity key={o.valor} accessibilityRole="button" accessibilityState={{ selected: valor === o.valor }}
            onPress={() => onChange(o.valor)}
            style={[s.opcaoBotao, valor === o.valor && { backgroundColor: C.main, borderColor: C.main }]}>
            <Text style={[s.opcaoTxt, valor === o.valor && { color: '#fff' }]}>{o.texto}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// Tela genérica: lista + formulário grande (adicionar e editar)
function Lista({ titulo, vazio, itens, campos, onAdd, onRemover, renderItem }) {
  const [form, setForm] = useState({});
  const [aberto, setAberto] = useState(false);
  const [ed, setEd] = useState(null);
  const fechar = () => { animar(); setAberto(false); setForm({}); setEd(null); };
  const abrirForm = () => { animar(); setAberto(true); };
  const editar = (it) => { animar(); setEd(it); setForm(it); setAberto(true); };
  const enviar = async () => {
    const erro = await onAdd(form, ed);
    if (erro) return Alert.alert('Confira os dados', erro);
    fechar();
  };
  const listaCampos = typeof campos === 'function' ? campos(form) : campos;
  return (
    <ScrollView contentContainerStyle={s.tela}>
      <Text style={s.titulo}>{titulo}</Text>
      {itens.length === 0 && <Text style={s.vazio}>{vazio}</Text>}
      {itens.map((it) => (
        <View key={it.id} style={s.card}>
          <View style={{ flex: 1 }}>{renderItem(it)}</View>
          <View>
            <TouchableOpacity accessibilityLabel="Editar" style={s.apagar} onPress={() => editar(it)}>
              <Text style={{ fontSize: 26 }}>✏️</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityLabel="Apagar" style={s.apagar}
              onPress={() => Alert.alert('Apagar?', 'Deseja apagar este item?', [
                { text: 'Não' }, { text: 'Sim, apagar', style: 'destructive', onPress: () => { animar(); onRemover(it); } }])}>
              <Text style={{ fontSize: 26 }}>🗑️</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
      {aberto ? (
        <View style={s.card2}>
          <Text style={[s.texto, { fontWeight: '800' }]}>{ed ? 'Editar' : 'Novo item'}</Text>
          {listaCampos.map((c) => {
            if (c.modo) return (
              <Seletor key={c.key} label={c.label} modo={c.modo} valor={form[c.key]}
                onChange={(v) => setForm((f) => ({ ...f, [c.key]: v }))} />
            );
            if (c.dias) return (
              <SeletorDias key={c.key} label={c.label} valor={form[c.key]}
                onChange={(v) => setForm((f) => ({ ...f, [c.key]: v }))} />
            );
            if (c.opcoes) return (
              <SeletorOpcoes key={c.key} label={c.label} opcoes={c.opcoes} valor={form[c.key]}
                onChange={(v) => setForm((f) => ({ ...f, [c.key]: v }))} />
            );
            return (
              <View key={c.key}>
                <Text style={s.label}>{c.label}</Text>
                <TextInput style={s.input} placeholder={c.dica} placeholderTextColor="#6B7C89"
                  keyboardType={c.tipo || 'default'} value={form[c.key] || ''}
                  onChangeText={(t) => setForm((f) => ({ ...f, [c.key]: c.mascara ? c.mascara(t) : t }))} />
              </View>
            );
          })}
          <Botao texto="Salvar" onPress={enviar} />
          <Botao texto="Cancelar" cor="#5B6B78" onPress={fechar} />
        </View>
      ) : (
        <Botao texto="+ Adicionar" onPress={abrirForm} />
      )}
    </ScrollView>
  );
}

function Remedios() {
  const [itens, salvar] = useArmazenado('remedios');
  return (
    <Lista titulo="💊 Meus remédios" vazio="Nenhum remédio ainda. Toque em Adicionar."
      itens={[...itens].sort((a, b) => a.hora.localeCompare(b.hora))}
      campos={[
        { key: 'nome', label: 'Nome do remédio', dica: 'Ex.: Losartana 50 mg' },
        { key: 'hora', label: 'Horário', modo: 'hora' },
        { key: 'dias', label: 'Dias da semana', dias: true }]}
      onAdd={async (f, ed) => {
        if (!f.nome?.trim()) return 'Digite o nome do remédio.';
        if (!horaOk(f.hora || '')) return 'Escolha o horário do remédio.';
        const dias = f.dias || [];
        const nids = await agendarAvisos(`${APP_NOME} • Hora do remédio`, f.nome.trim(), f.hora, { dias });
        gravar(itens, salvar, ed, { nome: f.nome.trim(), hora: f.hora, dias, nids });
      }}
      onRemover={(it) => { cancelarAvisos(it.nids); salvar(itens.filter((x) => x.id !== it.id)); }}
      renderItem={(it) => (
        <>
          <Text style={s.hora}>{it.hora}</Text>
          <Text style={s.texto}>{it.nome}</Text>
          <Text style={s.dica}>{it.dias?.length ? nomesDias(it.dias) : 'Todos os dias'}</Text>
        </>
      )} />
  );
}

function Agenda() {
  const [itens, salvar] = useArmazenado('agenda');
  return (
    <Lista titulo="📅 Meus compromissos" vazio="Nenhum compromisso. Toque em Adicionar."
      itens={itens}
      campos={(form) => [
        { key: 'titulo', label: 'O que é?', dica: 'Ex.: Consulta com cardiologista' },
        { key: 'repete', label: 'Repetição', opcoes: [{ valor: 'uma', texto: 'Só um dia' }, { valor: 'semana', texto: 'Toda semana' }] },
        ...(form.repete === 'semana'
          ? [{ key: 'dias', label: 'Em quais dias?', dias: true }]
          : [{ key: 'data', label: 'Dia', modo: 'data' }]),
        { key: 'hora', label: 'Horário', modo: 'hora' }]}
      onAdd={async (f, ed) => {
        if (!f.titulo?.trim()) return 'Digite o que é o compromisso.';
        const semana = f.repete === 'semana';
        if (semana && !(f.dias || []).length) return 'Escolha pelo menos um dia da semana.';
        if (!semana && !dataOk(f.data || '')) return 'Escolha o dia.';
        if (!horaOk(f.hora || '')) return 'Escolha o horário.';
        const nids = await agendarAvisos(`${APP_NOME} • Compromisso`, `${f.titulo.trim()} às ${f.hora}`, f.hora,
          semana ? { dias: f.dias } : { diaMes: f.data });
        gravar(itens, salvar, ed, {
          titulo: f.titulo.trim(), hora: f.hora, repete: f.repete || 'uma',
          data: semana ? null : f.data, dias: semana ? f.dias : null, nids,
        });
      }}
      onRemover={(it) => { cancelarAvisos(it.nids); salvar(itens.filter((x) => x.id !== it.id)); }}
      renderItem={(it) => (
        <>
          <Text style={s.hora}>{it.dias?.length ? `${nomesDias(it.dias)} às ${it.hora}` : `${it.data} às ${it.hora}`}</Text>
          <Text style={s.texto}>{it.titulo}</Text>
        </>
      )} />
  );
}

const ligar = (num, nome) =>
  Alert.alert(`Ligar para ${nome}?`, num, [{ text: 'Não' }, { text: 'Sim, ligar', onPress: () => Linking.openURL(`tel:${num.replace(/[^\d+]/g, '')}`) }]);

function Contatos() {
  const [itens, salvar] = useArmazenado('contatos');
  return (
    <Lista titulo="👨‍👩‍👧 Meus contatos" vazio="Nenhum contato. Adicione familiares e pessoas de confiança."
      itens={itens}
      campos={[
        { key: 'nome', label: 'Nome', dica: 'Ex.: Maria (filha)' },
        { key: 'tel', label: 'Telefone com DDD', dica: '+55 (61) 99999-0000', tipo: 'phone-pad', mascara: formatarTelefone }]}
      onAdd={(f, ed) => {
        if (!f.nome?.trim()) return 'Digite o nome.';
        if (!telefoneOk(f.tel)) return 'Digite o telefone com DDD.';
        gravar(itens, salvar, ed, { nome: f.nome.trim(), tel: f.tel });
      }}
      onRemover={(it) => salvar(itens.filter((x) => x.id !== it.id))}
      renderItem={(it) => (
        <>
          <Text style={s.texto}>{it.nome}</Text>
          <Text style={s.hora}>{it.tel}</Text>
          <Botao texto="📞 Ligar" onPress={() => ligar(it.tel, it.nome)} style={{ marginTop: 8, minHeight: 52 }} />
        </>
      )} />
  );
}

const EMERGENCIAS = [
  ['🚑 SAMU', '192', 'Emergência médica'],
  ['🚒 Bombeiros', '193', 'Incêndio e resgate'],
  ['🚓 Polícia', '190', 'Segurança'],
  ['🏠 Defesa Civil', '199', 'Desastres e risco'],
];

function Emergencia({ perfil }) {
  return (
    <ScrollView contentContainerStyle={s.tela}>
      <Text style={s.titulo}>🆘 Emergência</Text>
      <Text style={s.vazio}>Toque no botão e confirme para ligar.</Text>
      {!!perfil?.emergenciaTel && (
        <TouchableOpacity accessibilityRole="button"
          accessibilityLabel={`Ligar para ${perfil.emergenciaNome}, seu contato de emergência`}
          style={[s.botao, { backgroundColor: C.main, minHeight: 92, marginBottom: 14 }]}
          onPress={() => ligar(perfil.emergenciaTel, perfil.emergenciaNome)}>
          <Text style={s.botaoTxt}>👤 {perfil.emergenciaNome}</Text>
          <Text style={{ color: '#fff', fontSize: 18 }}>Seu contato de emergência</Text>
        </TouchableOpacity>
      )}
      {EMERGENCIAS.map(([nome, num, desc]) => (
        <TouchableOpacity key={num} accessibilityRole="button" accessibilityLabel={`${nome}, ${num}. ${desc}`}
          style={[s.botao, { backgroundColor: C.red, minHeight: 92, marginBottom: 14 }]} onPress={() => ligar(num, nome)}>
          <Text style={s.botaoTxt}>{nome} — {num}</Text>
          <Text style={{ color: '#fff', fontSize: 18 }}>{desc}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

// Tela de boas-vindas: aparece só na primeira vez, antes de liberar o app
function Onboarding({ aoConcluir }) {
  const [form, setForm] = useState({});
  const [erro, setErro] = useState('');

  const enviar = () => {
    if (!form.nome?.trim()) return setErro('Digite seu nome.');
    if (!dataAnoOk(form.nascimento || '')) return setErro('Escolha sua data de nascimento.');
    if (!form.emergenciaNome?.trim()) return setErro('Digite o nome do contato de emergência.');
    if (!telefoneOk(form.emergenciaTel)) return setErro('Digite um telefone de emergência com DDD.');
    setErro('');
    aoConcluir({
      nome: form.nome.trim(),
      nascimento: form.nascimento,
      emergenciaNome: form.emergenciaNome.trim(),
      emergenciaTel: form.emergenciaTel,
    });
  };

  return (
    <ScrollView contentContainerStyle={s.tela}>
      <Image source={ZelarIcone} style={s.logo} accessible={false} />
      <Text style={s.marca}>{APP_NOME}</Text>
      <Text style={s.titulo}>Bem-vindo!</Text>
      <Text style={s.vazio}>Antes de começar, precisamos de algumas informações suas.</Text>

      <View style={s.card2}>
        <Text style={s.label}>Seu nome</Text>
        <TextInput style={s.input} placeholder="Ex.: Maria da Silva" placeholderTextColor="#6B7C89"
          value={form.nome || ''} onChangeText={(t) => setForm((f) => ({ ...f, nome: t }))} />

        <Seletor label="Data de nascimento" modo="nascimento" valor={form.nascimento}
          onChange={(v) => setForm((f) => ({ ...f, nascimento: v }))} />

        <Text style={[s.texto, { fontWeight: '800', marginTop: 18 }]}>Contato de emergência</Text>
        <Text style={s.dica}>Uma pessoa de confiança para avisarmos se for preciso. Este campo é obrigatório.</Text>

        <Text style={s.label}>Nome do contato</Text>
        <TextInput style={s.input} placeholder="Ex.: Maria (filha)" placeholderTextColor="#6B7C89"
          value={form.emergenciaNome || ''} onChangeText={(t) => setForm((f) => ({ ...f, emergenciaNome: t }))} />

        <Text style={s.label}>Telefone com DDD</Text>
        <TextInput style={s.input} placeholder="+55 (61) 99999-0000" placeholderTextColor="#6B7C89" keyboardType="phone-pad"
          value={form.emergenciaTel || ''} onChangeText={(t) => setForm((f) => ({ ...f, emergenciaTel: formatarTelefone(t) }))} />
      </View>

      {!!erro && <Text style={[s.dica, { color: C.red, fontSize: 17, marginTop: 10 }]}>{erro}</Text>}
      <Botao texto="Começar a usar" onPress={enviar} style={s.gap} />
    </ScrollView>
  );
}

function Inicio({ ir, perfil }) {
  const [remedios] = useArmazenado('remedios');
  const agora = new Date().toTimeString().slice(0, 5);
  const ord = [...remedios].sort((a, b) => a.hora.localeCompare(b.hora));
  const prox = ord.find((r) => r.hora >= agora) || ord[0];
  const saudacaoBase = new Date().getHours() < 12 ? 'Bom dia' : new Date().getHours() < 18 ? 'Boa tarde' : 'Boa noite';
  const primeiroNome = perfil?.nome?.split(' ')[0];
  const saudacao = primeiroNome ? `${saudacaoBase}, ${primeiroNome}!` : `${saudacaoBase}!`;
  return (
    <ScrollView contentContainerStyle={s.tela}>
      <Image source={ZelarIcone} style={s.logo} accessible={false} />
      <Text style={s.marca} accessibilityLabel={`${APP_NOME}, aplicativo`}>{APP_NOME}</Text>
      <Text style={s.titulo}>{saudacao}</Text>
      <View style={[s.card, { borderLeftWidth: 8, borderLeftColor: C.gold }]}>
        <View>
          <Text style={s.label}>Próximo remédio</Text>
          {prox ? (<><Text style={s.hora}>{prox.hora}</Text><Text style={s.texto}>{prox.nome}</Text></>)
            : <Text style={s.texto}>Nenhum cadastrado</Text>}
        </View>
      </View>
      <Botao texto="💊 Remédios" onPress={() => ir('remedios')} style={s.gap} />
      <Botao texto="📅 Compromissos" onPress={() => ir('agenda')} style={s.gap} />
      <Botao texto="👨‍👩‍👧 Contatos" onPress={() => ir('contatos')} style={s.gap} />
      <Botao texto="🆘 Emergência" cor={C.red} onPress={() => ir('sos')} style={s.gap} />
    </ScrollView>
  );
}

// Fica de olho na hora: enquanto o app está aberto, dispara o alarme em
// tela cheia exatamente no minuto do remédio (além da notificação do sistema)
function useAlarmeRemedios() {
  const [remedios] = useArmazenado('remedios');
  const [fila, setFila] = useState([]);
  const ultimoMinuto = useRef(null);

  useEffect(() => {
    const checar = () => {
      const agora = new Date();
      const hhmm = agora.toTimeString().slice(0, 5);
      if (ultimoMinuto.current === hhmm) return;
      const diaSemana = agora.getDay() + 1; // mesmo padrão de DIAS_SEMANA (1 = domingo)
      const bateram = remedios.filter((r) => r.hora === hhmm && (!r.dias?.length || r.dias.includes(diaSemana)));
      if (bateram.length) {
        ultimoMinuto.current = hhmm;
        setFila((f) => [...f, ...bateram]);
      }
    };
    checar();
    const id = setInterval(checar, 15000);
    return () => clearInterval(id);
  }, [remedios]);

  const atual = fila[0] || null;
  const dispensar = () => setFila((f) => f.slice(1));
  return { atual, dispensar };
}

// Tela cheia de alarme: vibra sem parar até a pessoa tocar em um botão
function AlarmeModal({ remedio, onTomei, onAdiar }) {
  useEffect(() => {
    if (!remedio) return;
    Vibration.vibrate([0, 700, 400], true);
    return () => Vibration.cancel();
  }, [remedio]);

  if (!remedio) return null;
  return (
    <Modal visible transparent animationType="fade">
      <View style={s.alarmeFundo}>
        <View style={s.alarmeCard}>
          <Text style={s.alarmeIcone}>⏰💊</Text>
          <Text style={s.alarmeTitulo}>Hora do remédio!</Text>
          <Text style={s.alarmeNome}>{remedio.nome}</Text>
          <Botao texto="✅ Já tomei" onPress={onTomei} />
          <Botao texto="⏰ Adiar 10 minutos" cor="#5B6B78" onPress={onAdiar} style={s.gap} />
        </View>
      </View>
    </Modal>
  );
}

const ABAS = [['inicio', '🏠', 'Início'], ['remedios', '💊', 'Remédios'], ['agenda', '📅', 'Agenda'], ['contatos', '👨‍👩‍👧', 'Contatos'], ['sos', '🆘', 'SOS']];

export default function App() {
  return (
    <SafeAreaProvider>
      <Conteudo />
    </SafeAreaProvider>
  );
}

// Conteúdo real do app — fica dentro do SafeAreaProvider para que o Android
// também respeite a barra de status e a barra de gestos/botões, como o iOS já fazia
function Conteudo() {
  const [perfil, salvarPerfil] = useArmazenadoObjeto('perfil');
  const [aba, setAba] = useState('inicio');
  const opacidade = useRef(new Animated.Value(1)).current;
  const { atual: alarme, dispensar } = useAlarmeRemedios();

  // Troca de tela com um leve esmaecer (fade), em vez de aparecer seco
  const trocarAba = (nova) => {
    if (nova === aba) return;
    Animated.timing(opacidade, { toValue: 0, duration: 120, useNativeDriver: true }).start(() => {
      setAba(nova);
      Animated.timing(opacidade, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    });
  };

  const adiarAlarme = async () => {
    const daqui10 = new Date(Date.now() + 10 * 60 * 1000);
    const hora = `${String(daqui10.getHours()).padStart(2, '0')}:${String(daqui10.getMinutes()).padStart(2, '0')}`;
    const diaMes = `${String(daqui10.getDate()).padStart(2, '0')}/${String(daqui10.getMonth() + 1).padStart(2, '0')}`;
    await agendarAvisos(`${APP_NOME} • Hora do remédio`, alarme.nome, hora, { diaMes });
    dispensar();
  };

  // Ainda carregando do armazenamento — evita piscar a tela de boas-vindas à toa
  if (perfil === undefined) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Image source={ZelarIcone} style={s.logo} accessible={false} />
      </SafeAreaView>
    );
  }

  // Primeira vez usando o app: pede nome, nascimento e contato de emergência
  if (!perfil) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
        <StatusBar barStyle="dark-content" />
        <Onboarding aoConcluir={salvarPerfil} />
      </SafeAreaView>
    );
  }

  const tela = {
    inicio: <Inicio ir={trocarAba} perfil={perfil} />,
    remedios: <Remedios />,
    agenda: <Agenda />,
    contatos: <Contatos />,
    sos: <Emergencia perfil={perfil} />,
  }[aba];
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar barStyle="dark-content" />
      <Animated.View style={{ flex: 1, opacity: opacidade }}>{tela}</Animated.View>
      <View style={s.barra}>
        {ABAS.map(([k, ic, nome]) => (
          <AbaBotao key={k} icone={ic} nome={nome} ativo={aba === k} onPress={() => trocarAba(k)} />
        ))}
      </View>
      <AlarmeModal remedio={alarme} onTomei={dispensar} onAdiar={adiarAlarme} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  tela: { padding: 20, paddingBottom: 40 },
  logo: { width: 72, height: 72, borderRadius: 18, alignSelf: 'center', marginBottom: 10, resizeMode: 'contain' },
  marca: { fontSize: 16, fontWeight: '800', color: C.main, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4, textAlign: 'center' },
  titulo: { fontSize: 32, fontWeight: '800', color: C.ink, marginBottom: 16 },
  alarmeFundo: { flex: 1, backgroundColor: 'rgba(11,20,30,0.92)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  alarmeCard: { backgroundColor: C.card, borderRadius: 24, padding: 28, width: '100%', alignItems: 'center' },
  alarmeIcone: { fontSize: 56, marginBottom: 12 },
  alarmeTitulo: { fontSize: 28, fontWeight: '800', color: C.red, marginBottom: 8, textAlign: 'center' },
  alarmeNome: { fontSize: 26, fontWeight: '700', color: C.ink, marginBottom: 20, textAlign: 'center' },
  vazio: { fontSize: 20, color: '#44576A', marginBottom: 16, lineHeight: 28 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 16, padding: 18, marginBottom: 14, borderWidth: 1.5, borderColor: C.line },
  card2: { backgroundColor: C.card, borderRadius: 16, padding: 18, borderWidth: 1.5, borderColor: C.line },
  hora: { fontSize: 24, fontWeight: '700', color: C.main },
  texto: { fontSize: 24, color: C.ink, marginTop: 2 },
  label: { fontSize: 20, fontWeight: '600', color: C.ink, marginTop: 10, marginBottom: 6 },
  dica: { fontSize: 15, color: '#5B6B78', marginBottom: 8 },
  input: { fontSize: 24, borderWidth: 2, borderColor: C.ink, borderRadius: 12, padding: 14, backgroundColor: '#fff', color: C.ink, marginBottom: 6 },
  linhaDias: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 },
  diaBotao: { width: 48, height: 48, borderRadius: 24, borderWidth: 2, borderColor: C.ink, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  diaTxt: { fontSize: 18, fontWeight: '800', color: C.ink },
  linhaOpcoes: { flexDirection: 'row', gap: 10, marginBottom: 6 },
  opcaoBotao: { flex: 1, minHeight: 56, borderRadius: 12, borderWidth: 2, borderColor: C.ink, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  opcaoTxt: { fontSize: 17, fontWeight: '700', color: C.ink, textAlign: 'center' },
  botao: { minHeight: 68, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, marginTop: 10 },
  botaoTxt: { color: '#fff', fontSize: 24, fontWeight: '800', textAlign: 'center' },
  gap: { marginTop: 14 },
  apagar: { padding: 12, marginLeft: 8 },
  barra: { flexDirection: 'row', backgroundColor: C.card, borderTopWidth: 2, borderTopColor: C.line, padding: 6 },
  aba: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 12, marginHorizontal: 2 },
  abaTxt: { fontSize: 13, fontWeight: '700', color: C.ink },
});