import React, { useState, useEffect, useRef } from "react";

/**
 * ───────────────────────────────────────────────────────────────────────────
 *  SIMULADOR SANTANDER REWARDS  —  Comparador de Cartões
 *  Mostra quantos pontos o cliente ganha hoje x quanto poderia ganhar com o
 *  cartão ideal + o multiplicador do programa Rewards, e o valor que está
 *  "deixando na mesa".
 *
 *  >>> CONSTANTES AJUSTÁVEIS (mude aqui e o simulador inteiro recalcula) <<<
 * ───────────────────────────────────────────────────────────────────────────
 */
const COTACAO_DOLAR = 5.1;     // R$ por US$1 (pontos são por US$1 gasto)
const CUSTO_MILHEIRO = 35;     // R$ por 1.000 pontos (milheiro Esfera)
const FATOR_PROJECAO = 5;      // multiplicador da fórmula do "valor na mesa"

// Pontuação base por US$1 (compra nacional) — fonte: blog oficial Santander
const CARTOES = {
  elite:     { nome: "Elite",     base: 1.5, sub: "1,5 ponto por US$1" },
  unique:    { nome: "Unique",    base: 2.2, sub: "2,2 pontos por US$1" },
  unlimited: { nome: "Unlimited", base: 3.0, sub: "3,0 pontos por US$1" },
};

// Cartões de alta renda dos concorrentes (pontuação BASE de referência por US$1).
// Valores médios de mercado — valide/ajuste conforme as ofertas vigentes.
const CARTOES_ATUAIS = [
  { id: "itau_personnalite", nome: "Itaú Personnalité (Visa Infinite)",   base: 2.2 },
  { id: "itau_uniclass",     nome: "Itaú Uniclass Black",                 base: 1.5 },
  { id: "bradesco_aeternum", nome: "Bradesco Aeternum (Visa Infinite)",   base: 2.2 },
  { id: "bradesco_infinite", nome: "Bradesco Visa Infinite",             base: 2.0 },
  { id: "c6_carbon",         nome: "C6 Carbon (Mastercard Black)",        base: 2.5 },
  { id: "xp_infinite",       nome: "XP Visa Infinite",                   base: 2.0 },
  { id: "btg_black",         nome: "BTG Mastercard Black",               base: 1.8 },
  { id: "brb_dux",           nome: "BRB Dux (Visa Infinite)",            base: 4.0 },
  { id: "ourocard_infinite", nome: "Ourocard Visa Infinite (BB)",        base: 2.0 },
  { id: "safra_black",       nome: "Safra Mastercard Black",             base: 2.0 },
  { id: "inter_black",       nome: "Inter Black / Win",                  base: 1.0 },
  { id: "nubank_ultra",      nome: "Nubank Ultravioleta",                base: 1.0 },
  { id: "outro",             nome: "Outro / não tenho cartão de pontos", base: 1.0 },
];
const cartaoAtualById = (id) => CARTOES_ATUAIS.find((c) => c.id === id) || CARTOES_ATUAIS[0];

// Régua de níveis do programa (passos -> bônus de aceleração)
const NIVEIS = [
  { nivel: 1, min: 0,   max: 34,       bonus: 0.0,  rotulo: "Sem bônus" },
  { nivel: 2, min: 35,  max: 89,       bonus: 0.15, rotulo: "+15%" },
  { nivel: 3, min: 90,  max: 209,      bonus: 0.30, rotulo: "+30%" },
  { nivel: 4, min: 210, max: Infinity, bonus: 0.50, rotulo: "+50%" },
];

// Tarefas com check (passos fixos por tarefa)
const TAREFAS = [
  { id: "salario",     label: "Trazer meu salário para o Santander",        desc: "Recebimento ou portabilidade",            passos: 15, grupo: "Recebimentos e rotina" },
  { id: "pix",         label: "Cadastrar CPF e celular como chave Pix",     desc: "As duas chaves cadastradas e ativas",     passos: 6,  grupo: "Recebimentos e rotina" },
  { id: "debito",      label: "Pagar contas no débito automático",          desc: "Luz, água, etc. cadastradas e efetivadas", passos: 2,  grupo: "Recebimentos e rotina" },
  { id: "openfinance", label: "Conectar o Open Finance",                    desc: "Dados de outros bancos compartilhados",   passos: 1,  grupo: "Recebimentos e rotina" },
  { id: "wallet",      label: "Usar o cartão na carteira digital (> R$200/mês)", desc: "Apple Pay / Google Pay no crédito",  passos: 1,  grupo: "Recebimentos e rotina" },
  { id: "assinatura",  label: "Colocar uma assinatura recorrente no cartão", desc: "Streaming, academia, etc.",              passos: 1,  grupo: "Recebimentos e rotina" },
  { id: "seguro",      label: "Transferir meu seguro para o Santander",     desc: "Vida, Auto, Casa ou Acidentes Pessoais (vale 1)", passos: 2, grupo: "Produtos Santander" },
  { id: "credito",     label: "Transferir meu crédito para o Santander",    desc: "Imobiliário, Automóvel ou Consignado/CP (vale 1)", passos: 2, grupo: "Produtos Santander" },
];

const PASSO_POR_REAL_INVEST = 10000; // 1 passo a cada R$10.000 investidos
const CAP_INVEST = 200;              // limite de passos de investimento
const PASSO_POR_REAL_GASTO = 250;    // 1 passo a cada R$250 gastos no cartão
const CAP_GASTO = 200;               // limite de passos de cartão

/* ── Helpers ──────────────────────────────────────────────────────────────*/
const onlyDigits = (s) => (s || "").toString().replace(/\D/g, "");
const fmtMilhar = (n) => Number(n || 0).toLocaleString("pt-BR");
const fmtReais = (n) =>
  "R$ " + Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtReaisCurto = (n) =>
  "R$ " + Number(n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });

const nivelDePassos = (p) => NIVEIS.find((n) => p >= n.min && p <= n.max) || NIVEIS[0];

const maskTelefone = (v) => {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

/* ── Motor de cálculo ─────────────────────────────────────────────────────*/
function calcular(form) {
  const passosInvest = Math.min(Math.floor(form.investimentos / PASSO_POR_REAL_INVEST), CAP_INVEST);
  const passosGasto = Math.min(Math.floor(form.gastoCartao / PASSO_POR_REAL_GASTO), CAP_GASTO);
  const passosTarefas = TAREFAS.filter((t) => form.tarefas[t.id]).reduce((s, t) => s + t.passos, 0);
  const totalPassos = passosInvest + passosGasto + passosTarefas;

  const nivel = nivelDePassos(totalPassos);

  const gastoUSD = form.gastoCartao / COTACAO_DOLAR;
  const baseAtual = cartaoAtualById(form.cartaoAtual).base;
  const baseDesejado = CARTOES[form.cartaoDesejado].base;

  // Hoje: cartão atual, sem o programa (nível 1)
  const pontosHoje = gastoUSD * baseAtual;
  // Com o programa: cartão desejado + bônus do nível atingido
  const pontosPrograma = gastoUSD * baseDesejado * (1 + nivel.bonus);

  const pontosAMais = Math.max(0, pontosPrograma - pontosHoje);

  // Valor na mesa = diferença de pontos x FATOR x (custo milheiro / 1000)
  const valorNaMesa = pontosAMais * FATOR_PROJECAO * (CUSTO_MILHEIRO / 1000);

  return {
    passosInvest, passosGasto, passosTarefas, totalPassos,
    nivel, pontosHoje, pontosPrograma, pontosAMais, valorNaMesa,
    baseAtual, baseDesejado,
  };
}

/* ── Count-up para os números ─────────────────────────────────────────────*/
function useCountUp(target, dur = 900) {
  const [val, setVal] = useState(0);
  const ref = useRef();
  useEffect(() => {
    let start;
    cancelAnimationFrame(ref.current);
    const step = (t) => {
      if (!start) start = t;
      const p = Math.min((t - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(target * eased);
      if (p < 1) ref.current = requestAnimationFrame(step);
    };
    ref.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(ref.current);
  }, [target, dur]);
  return val;
}

/* ── Campo de moeda ───────────────────────────────────────────────────────*/
function CampoMoeda({ valor, onChange, placeholder, destaque }) {
  return (
    <div className={"sr-money " + (destaque ? "sr-money--big" : "")}>
      <span className="sr-money__prefix">R$</span>
      <input
        inputMode="numeric"
        className="sr-money__input"
        value={valor ? fmtMilhar(valor) : ""}
        onChange={(e) => onChange(Number(onlyDigits(e.target.value)))}
        placeholder={placeholder}
      />
    </div>
  );
}

/* ── Régua de níveis (elemento-assinatura) ────────────────────────────────*/
function ReguaNiveis({ passos, nivelAtual }) {
  const escalaMax = 240; // ponto visual onde a barra "enche"
  const pct = Math.min((passos / escalaMax) * 100, 100);
  return (
    <div className="sr-regua">
      <div className="sr-regua__track">
        <div className="sr-regua__fill" style={{ width: pct + "%" }} />
        {[34, 89, 209].map((marco) => (
          <div key={marco} className="sr-regua__marco" style={{ left: (marco / escalaMax) * 100 + "%" }} />
        ))}
        <div className="sr-regua__pin" style={{ left: pct + "%" }}>
          <span className="sr-regua__pin-bolha">{fmtMilhar(passos)}</span>
        </div>
      </div>
      <div className="sr-regua__niveis">
        {NIVEIS.map((n) => (
          <div key={n.nivel} className={"sr-regua__nivel " + (n.nivel === nivelAtual.nivel ? "is-ativo" : "")}>
            <strong>Nível {n.nivel}</strong>
            <span>{n.rotulo}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Tela de resultado ────────────────────────────────────────────────────*/
function Resultado({ r, form, onVoltar }) {
  const hoje = useCountUp(r.pontosHoje);
  const prog = useCountUp(r.pontosPrograma);
  const amais = useCountUp(r.pontosAMais);
  const valor = useCountUp(r.valorNaMesa);
  const [abrirCalculo, setAbrirCalculo] = useState(false);

  const breakdown = [
    r.passosGasto > 0 && { l: "Gastos no cartão", v: r.passosGasto },
    r.passosInvest > 0 && { l: "Investimentos", v: r.passosInvest },
    ...TAREFAS.filter((t) => form.tarefas[t.id]).map((t) => ({ l: t.label, v: t.passos })),
  ].filter(Boolean);

  const nomeAtual = cartaoAtualById(form.cartaoAtual).nome;
  const nomeDesejado = "Santander " + CARTOES[form.cartaoDesejado].nome;

  return (
    <div className="sr-result">
      <div className="sr-result__hello">
        Pronto, {form.nome.split(" ")[0] || "tudo certo"} 👋
      </div>
      <h2 className="sr-result__title">
        Você está deixando<br />
        <span className="sr-money-hl">{fmtReais(valor)}</span><br />
        na mesa por mês.
      </h2>
      <p className="sr-result__sub">
        Saindo do <b>{nomeAtual}</b> para o <b>{nomeDesejado}</b> com o programa Rewards no{" "}
        <b>Nível {r.nivel.nivel} ({r.nivel.rotulo})</b>.
      </p>

      {/* Comparativo de pontos */}
      <div className="sr-compara">
        <div className="sr-compara__col">
          <span className="sr-compara__cap">Hoje você ganha</span>
          <span className="sr-compara__num">{fmtMilhar(Math.round(hoje))}</span>
          <span className="sr-compara__unit">pontos / mês</span>
        </div>
        <div className="sr-compara__seta">→</div>
        <div className="sr-compara__col sr-compara__col--win">
          <span className="sr-compara__cap">Com o Rewards</span>
          <span className="sr-compara__num">{fmtMilhar(Math.round(prog))}</span>
          <span className="sr-compara__unit">pontos / mês</span>
        </div>
      </div>

      <div className="sr-amais">
        <span className="sr-amais__plus">+{fmtMilhar(Math.round(amais))}</span>
        <span className="sr-amais__lbl">pontos a mais todo mês</span>
      </div>

      {/* Régua de níveis */}
      <div className="sr-bloco">
        <div className="sr-bloco__cap">
          Seus {fmtMilhar(r.totalPassos)} passos te colocam no <b>Nível {r.nivel.nivel}</b>
        </div>
        <ReguaNiveis passos={r.totalPassos} nivelAtual={r.nivel} />
      </div>

      {/* De onde vieram os passos */}
      <div className="sr-bloco">
        <div className="sr-bloco__cap">De onde vieram seus passos</div>
        <ul className="sr-break">
          {breakdown.map((b, i) => (
            <li key={i}>
              <span>{b.l}</span>
              <b>+{b.v}</b>
            </li>
          ))}
          <li className="sr-break__total">
            <span>Total</span>
            <b>{r.totalPassos} passos</b>
          </li>
        </ul>
      </div>

      {/* Como calculamos */}
      <button className="sr-calc-toggle" onClick={() => setAbrirCalculo((v) => !v)}>
        {abrirCalculo ? "▾ " : "▸ "} Como calculamos o valor na mesa
      </button>
      {abrirCalculo && (
        <div className="sr-calc">
          <p>Diferença de pontos × {FATOR_PROJECAO} × (R$ {CUSTO_MILHEIRO} ÷ 1.000)</p>
          <p>
            {fmtMilhar(Math.round(r.pontosAMais))} × {FATOR_PROJECAO} × {(CUSTO_MILHEIRO / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 3 })} ={" "}
            <b>{fmtReais(r.valorNaMesa)}</b>
          </p>
          <p className="sr-calc__obs">
            Gasto convertido a US$ pela cotação de R$ {COTACAO_DOLAR.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}. Custo do milheiro Esfera: R$ {CUSTO_MILHEIRO}/1.000 pontos.
          </p>
        </div>
      )}

      <button className="sr-btn sr-btn--ghost" onClick={onVoltar}>Refazer simulação</button>
      <p className="sr-disc">
        Simulação ilustrativa para fins de comparação. Valores reais dependem de aprovação, do câmbio do dia e das regras vigentes do programa.
      </p>
    </div>
  );
}

/* ── App principal ────────────────────────────────────────────────────────*/
export default function App() {
  const [step, setStep] = useState("form");
  const [resultado, setResultado] = useState(null);
  const [erros, setErros] = useState({});
  const [modalAberto, setModalAberto] = useState(false);

  const [form, setForm] = useState({
    cartaoAtual: "itau_personnalite",
    investimentos: 0,
    gastoCartao: 0,
    tarefas: {},
    cartaoDesejado: "unlimited",
    nome: "",
    email: "",
    telefone: "",
  });

  const set = (campo, v) => setForm((f) => ({ ...f, [campo]: v }));
  const toggleTarefa = (id) =>
    setForm((f) => ({ ...f, tarefas: { ...f.tarefas, [id]: !f.tarefas[id] } }));

  const abrirSimulacao = () => {
    const e = {};
    if (!form.gastoCartao) e.gastoCartao = "Informe seu gasto mensal no cartão.";
    setErros(e);
    if (Object.keys(e).length) {
      const primeiro = document.querySelector(".sr-field--erro");
      if (primeiro) primeiro.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setModalAberto(true);
  };

  const enviar = () => {
    const e = {};
    if (!form.nome.trim()) e.nome = "Como podemos te chamar?";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "E-mail inválido.";
    if (onlyDigits(form.telefone).length < 10) e.telefone = "Telefone inválido.";
    setErros(e);
    if (Object.keys(e).length) return;
    // >>> LEAD: envie { nome, email, telefone, ...calcular(form) } ao Supabase aqui.
    setResultado(calcular(form));
    setModalAberto(false);
    setStep("result");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const gruposCheck = ["Recebimentos e rotina", "Produtos Santander"];

  return (
    <div className="sr-wrap">
      <Estilos />
      <div className="sr-card">
        {/* Cabeçalho */}
        <header className="sr-head">
          <div className="sr-flame" aria-hidden>
            <svg viewBox="0 0 32 32" width="26" height="26">
              <path d="M16 2c2 5-3 7-3 11a3 3 0 0 0 6 0c0-1.4-.6-2.4-.6-2.4 3 1.6 5 4.6 5 8.4a7.4 7.4 0 1 1-14.8 0c0-6 5-9 7.4-15z" fill="#fff" />
            </svg>
          </div>
          <div>
            <div className="sr-head__brand">Santander Rewards</div>
            <div className="sr-head__tag">Simulador de pontos do seu cartão</div>
          </div>
        </header>

        {step === "form" && (
          <div className="sr-form">
            <h1 className="sr-h1">Descubra quanto você está deixando na mesa</h1>
            <p className="sr-lead">
              Quanto mais você concentra no Santander, mais passos acumula — e mais pontos seu cartão rende. Simule em 1 minuto.
            </p>

            {/* Cartão atual */}
            <label className="sr-label">Qual seu cartão hoje?</label>
            <div className="sr-select">
              <select value={form.cartaoAtual} onChange={(e) => set("cartaoAtual", e.target.value)}>
                {CARTOES_ATUAIS.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </div>

            {/* Principais: investimentos e gastos */}
            <div className="sr-grid2">
              <div className="sr-field">
                <label className="sr-label">Quanto você tem investido?</label>
                <span className="sr-hint">1 passo a cada R$10.000 (até 200)</span>
                <CampoMoeda valor={form.investimentos} onChange={(v) => set("investimentos", v)} placeholder="0" destaque />
              </div>
              <div className={"sr-field " + (erros.gastoCartao ? "sr-field--erro" : "")}>
                <label className="sr-label">Quanto você gasta por mês?</label>
                <span className="sr-hint">1 passo a cada R$250 (até 200)</span>
                <CampoMoeda valor={form.gastoCartao} onChange={(v) => set("gastoCartao", v)} placeholder="0" destaque />
                {erros.gastoCartao && <span className="sr-erro">{erros.gastoCartao}</span>}
              </div>
            </div>

            {/* Outras tarefas */}
            <label className="sr-label sr-label--sec">Como você quer se relacionar com o Santander?</label>
            {gruposCheck.map((g) => (
              <div key={g} className="sr-grupo">
                <div className="sr-grupo__nome">{g}</div>
                <div className="sr-checks">
                  {TAREFAS.filter((t) => t.grupo === g).map((t) => (
                    <button
                      key={t.id}
                      className={"sr-check " + (form.tarefas[t.id] ? "is-on" : "")}
                      onClick={() => toggleTarefa(t.id)}
                    >
                      <span className="sr-check__box">{form.tarefas[t.id] ? "✓" : ""}</span>
                      <span className="sr-check__txt">
                        <b>{t.label}</b>
                        {t.desc && <em>{t.desc}</em>}
                      </span>
                      <span className="sr-check__passos">+{t.passos}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {/* Cartão desejado */}
            <label className="sr-label sr-label--sec">Qual cartão você gostaria de ter?</label>
            <div className="sr-cards">
              {["elite", "unique", "unlimited"].map((c) => (
                <button
                  key={c}
                  className={"sr-cartao " + (form.cartaoDesejado === c ? "is-on" : "")}
                  onClick={() => set("cartaoDesejado", c)}
                >
                  <span className="sr-cartao__nome">{CARTOES[c].nome}</span>
                </button>
              ))}
            </div>

            <button className="sr-btn" onClick={abrirSimulacao}>SIMULAR</button>
            <p className="sr-disc">Simulação gratuita e sem compromisso. Você verá seu resultado na próxima etapa.</p>
          </div>
        )}

        {step === "result" && resultado && (
          <Resultado r={resultado} form={form} onVoltar={() => { setStep("form"); window.scrollTo({ top: 0 }); }} />
        )}
      </div>

      {/* Pop-up de contato */}
      {modalAberto && (
        <div className="sr-modal" onClick={(e) => { if (e.target.classList.contains("sr-modal")) setModalAberto(false); }}>
          <div className="sr-modal__card">
            <button className="sr-modal__x" onClick={() => setModalAberto(false)} aria-label="Fechar">×</button>
            <h3 className="sr-modal__title">Quase lá!</h3>
            <p className="sr-modal__sub">Preencha seus dados para ver quanto você está deixando na mesa.</p>
            <div className={"sr-field " + (erros.nome ? "sr-field--erro" : "")}>
              <input className="sr-input" placeholder="Nome completo" value={form.nome} onChange={(e) => set("nome", e.target.value)} />
              {erros.nome && <span className="sr-erro">{erros.nome}</span>}
            </div>
            <div className={"sr-field " + (erros.email ? "sr-field--erro" : "")}>
              <input className="sr-input" placeholder="E-mail" value={form.email} onChange={(e) => set("email", e.target.value)} />
              {erros.email && <span className="sr-erro">{erros.email}</span>}
            </div>
            <div className={"sr-field " + (erros.telefone ? "sr-field--erro" : "")}>
              <input className="sr-input" placeholder="(11) 99999-9999" value={form.telefone} onChange={(e) => set("telefone", maskTelefone(e.target.value))} />
              {erros.telefone && <span className="sr-erro">{erros.telefone}</span>}
            </div>
            <button className="sr-btn" onClick={enviar}>ENVIAR</button>
            <p className="sr-modal__disc">Seus dados não saem deste dispositivo nesta versão de demonstração.</p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Estilos ──────────────────────────────────────────────────────────────*/
function Estilos() {
  return (
    <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700;800&family=Inter:wght@400;500;600;700&display=swap');

    .sr-wrap{
      --red:#EC0000; --red-deep:#B30000; --ink:#1B1B1F; --muted:#73737B;
      --line:#ECECF0; --bg:#F6F6F8; --gold:#E0A100; --green:#0A8A4F;
      font-family:'Inter',system-ui,sans-serif; color:var(--ink);
      background:var(--bg); min-height:100%; padding:24px 14px; display:flex; justify-content:center;
      -webkit-font-smoothing:antialiased;
    }
    .sr-wrap *{box-sizing:border-box;}
    .sr-card{width:100%; max-width:540px; background:#fff; border-radius:22px;
      box-shadow:0 12px 40px rgba(20,0,0,.10),0 2px 8px rgba(0,0,0,.04); overflow:hidden;}

    /* Cabeçalho */
    .sr-head{display:flex; align-items:center; gap:12px; padding:18px 22px;
      background:linear-gradient(135deg,var(--red) 0%,var(--red-deep) 100%); color:#fff;}
    .sr-flame{width:42px; height:42px; border-radius:50%; background:rgba(255,255,255,.16);
      display:flex; align-items:center; justify-content:center;}
    .sr-head__brand{font-family:'Poppins'; font-weight:700; font-size:18px; line-height:1;}
    .sr-head__tag{font-size:12.5px; opacity:.9; margin-top:3px;}

    .sr-form,.sr-result{padding:24px 22px 28px;}
    .sr-h1{font-family:'Poppins'; font-weight:800; font-size:26px; line-height:1.12; margin:0 0 8px;}
    .sr-lead{font-size:14.5px; color:var(--muted); margin:0 0 22px; line-height:1.5;}

    .sr-label{display:block; font-weight:700; font-size:14px; margin:0 0 8px;}
    .sr-label--sec{margin-top:26px;}
    .sr-hint{display:block; font-size:12px; color:var(--muted); margin:-4px 0 8px;}

    /* Pills cartão atual */
    .sr-pills{display:flex; flex-wrap:wrap; gap:8px; margin-bottom:20px;}
    .sr-pill{border:1.5px solid var(--line); background:#fff; color:var(--ink);
      padding:9px 16px; border-radius:999px; font-size:13.5px; font-weight:600; cursor:pointer; transition:.15s;}
    .sr-pill:hover{border-color:#d9b3b3;}
    .sr-pill.is-on{background:var(--red); border-color:var(--red); color:#fff;}

    /* Grid */
    .sr-grid2{display:grid; grid-template-columns:1fr 1fr; gap:14px;}
    @media(max-width:480px){.sr-grid2{grid-template-columns:1fr;}}
    .sr-field{margin-bottom:6px;}
    @media(min-width:481px){.sr-grid2 .sr-label{min-height:19px;}}

    /* Campo de moeda */
    .sr-money{display:flex; align-items:center; border:1.5px solid var(--line);
      border-radius:13px; padding:0 14px; background:#fff; transition:.15s;}
    .sr-money:focus-within{border-color:var(--red); box-shadow:0 0 0 3px rgba(236,0,0,.10);}
    .sr-money__prefix{color:var(--muted); font-weight:600; font-size:15px; margin-right:6px;}
    .sr-money__input{border:0; outline:0; width:100%; padding:13px 0; font-size:16px;
      font-family:'Inter'; font-weight:600; color:var(--ink); background:transparent;}
    .sr-money--big .sr-money__input{font-size:19px;}

    /* Inputs texto */
    .sr-input{width:100%; border:1.5px solid var(--line); border-radius:13px; padding:13px 14px;
      font-size:15px; font-family:'Inter'; outline:0; transition:.15s; background:#fff;}
    .sr-input:focus{border-color:var(--red); box-shadow:0 0 0 3px rgba(236,0,0,.10);}

    .sr-field--erro .sr-money,.sr-field--erro .sr-input{border-color:var(--red);}
    .sr-erro{display:block; color:var(--red); font-size:12px; margin-top:5px; font-weight:600;}

    /* Grupos de check */
    .sr-grupo{margin-bottom:14px;}
    .sr-grupo__nome{font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.04em;
      color:var(--muted); margin:0 0 8px;}
    .sr-checks{display:flex; flex-direction:column; gap:8px;}
    .sr-check{display:flex; align-items:center; gap:11px; width:100%; text-align:left;
      border:1.5px solid var(--line); background:#fff; border-radius:13px; padding:11px 13px; cursor:pointer; transition:.15s;}
    .sr-check:hover{border-color:#d9b3b3;}
    .sr-check.is-on{border-color:var(--red); background:#FFF5F5;}
    .sr-check__box{flex:0 0 22px; height:22px; border-radius:7px; border:1.5px solid #c9c9d2;
      display:flex; align-items:center; justify-content:center; color:#fff; font-size:13px; font-weight:800; transition:.15s;}
    .sr-check.is-on .sr-check__box{background:var(--red); border-color:var(--red);}
    .sr-check__txt{flex:1; display:flex; flex-direction:column; line-height:1.25;}
    .sr-check__txt b{font-size:14px; font-weight:600;}
    .sr-check__txt em{font-style:normal; font-size:12px; color:var(--muted); margin-top:1px;}
    .sr-check__passos{font-family:'Poppins'; font-weight:700; font-size:13px; color:var(--red); flex:0 0 auto;}

    /* Prévia */
    .sr-previa{display:flex; align-items:center; justify-content:space-between; gap:12px;
      margin:18px 0 4px; padding:14px 16px; border-radius:14px;
      background:linear-gradient(135deg,#1B1B1F,#33333a); color:#fff;}
    .sr-previa__num{font-family:'Poppins'; font-weight:800; font-size:22px;}
    .sr-previa__nivel{font-weight:700; font-size:13px; padding:6px 12px; border-radius:999px; background:rgba(255,255,255,.16);}

    /* Cards desejado */
    .sr-cards{display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px;}
    @media(max-width:480px){.sr-cards{grid-template-columns:1fr;}}
    .sr-cartao{display:flex; flex-direction:column; align-items:flex-start; gap:3px;
      border:1.5px solid var(--line); background:#fff; border-radius:14px; padding:14px; cursor:pointer; transition:.15s;}
    .sr-cartao:hover{border-color:#d9b3b3;}
    .sr-cartao.is-on{border-color:var(--red); background:linear-gradient(135deg,#EC0000,#B30000); color:#fff;}
    .sr-cartao__nome{font-family:'Poppins'; font-weight:700; font-size:16px;}
    .sr-cartao__base{font-size:12px; opacity:.85;}

    /* Botões */
    .sr-btn{width:100%; margin-top:22px; border:0; border-radius:14px; cursor:pointer;
      background:var(--red); color:#fff; font-family:'Poppins'; font-weight:700; font-size:16px;
      letter-spacing:.04em; padding:16px; transition:.15s; box-shadow:0 6px 18px rgba(236,0,0,.28);}
    .sr-btn:hover{background:var(--red-deep); transform:translateY(-1px);}
    .sr-btn:active{transform:translateY(0);}
    .sr-btn--ghost{background:#fff; color:var(--red); border:1.5px solid var(--red); box-shadow:none; margin-top:18px;}
    .sr-btn--ghost:hover{background:#FFF5F5;}

    .sr-disc{font-size:11.5px; color:var(--muted); margin:12px 2px 0; line-height:1.45; text-align:center;}

    /* ── Resultado ── */
    .sr-result__hello{font-weight:600; color:var(--muted); font-size:14px; margin-bottom:6px;}
    .sr-result__title{font-family:'Poppins'; font-weight:800; font-size:27px; line-height:1.18; margin:0 0 10px;}
    .sr-money-hl{color:var(--green);}
    .sr-result__sub{font-size:14.5px; color:var(--muted); line-height:1.5; margin:0 0 22px;}

    .sr-compara{display:flex; align-items:stretch; gap:10px; margin-bottom:14px;}
    .sr-compara__col{flex:1; border:1.5px solid var(--line); border-radius:16px; padding:16px 14px;
      display:flex; flex-direction:column; align-items:center; text-align:center;}
    .sr-compara__col--win{border-color:var(--red); background:linear-gradient(135deg,#FFF5F5,#fff);}
    .sr-compara__cap{font-size:12px; color:var(--muted); font-weight:600;}
    .sr-compara__num{font-family:'Poppins'; font-weight:800; font-size:30px; line-height:1.1; margin:4px 0;}
    .sr-compara__col--win .sr-compara__num{color:var(--red);}
    .sr-compara__unit{font-size:12px; color:var(--muted);}
    .sr-compara__seta{align-self:center; color:var(--red); font-size:22px; font-weight:800;}

    .sr-amais{display:flex; flex-direction:column; align-items:center; padding:16px;
      border-radius:16px; background:linear-gradient(135deg,#1B1B1F,#33333a); color:#fff; margin-bottom:22px;}
    .sr-amais__plus{font-family:'Poppins'; font-weight:800; font-size:34px; color:#FFD36B;}
    .sr-amais__lbl{font-size:13px; opacity:.9;}

    .sr-bloco{margin-bottom:22px;}
    .sr-bloco__cap{font-size:14px; margin-bottom:14px;}

    /* Régua */
    .sr-regua__track{position:relative; height:12px; background:#EFEFF3; border-radius:999px; margin:30px 0 14px;}
    .sr-regua__fill{position:absolute; left:0; top:0; bottom:0; border-radius:999px;
      background:linear-gradient(90deg,#EC0000,#FF6A3D); transition:width 1s cubic-bezier(.2,.8,.2,1);}
    .sr-regua__marco{position:absolute; top:-3px; width:2px; height:18px; background:#fff; transform:translateX(-1px);}
    .sr-regua__pin{position:absolute; top:50%; transform:translate(-50%,-50%); transition:left 1s cubic-bezier(.2,.8,.2,1);}
    .sr-regua__pin-bolha{position:absolute; bottom:14px; left:50%; transform:translateX(-50%);
      background:var(--ink); color:#fff; font-size:12px; font-weight:700; padding:3px 9px; border-radius:8px; white-space:nowrap;}
    .sr-regua__pin-bolha:after{content:''; position:absolute; bottom:-4px; left:50%; transform:translateX(-50%) rotate(45deg);
      width:8px; height:8px; background:var(--ink);}
    .sr-regua__niveis{display:grid; grid-template-columns:repeat(4,1fr); gap:6px;}
    .sr-regua__nivel{display:flex; flex-direction:column; align-items:center; text-align:center;
      padding:8px 4px; border-radius:11px; border:1.5px solid var(--line); font-size:12px; color:var(--muted);}
    .sr-regua__nivel strong{font-size:12px; color:var(--ink);}
    .sr-regua__nivel.is-ativo{border-color:var(--red); background:#FFF5F5; color:var(--red);}
    .sr-regua__nivel.is-ativo strong{color:var(--red);}

    /* Breakdown */
    .sr-break{list-style:none; margin:0; padding:0; border:1.5px solid var(--line); border-radius:14px; overflow:hidden;}
    .sr-break li{display:flex; justify-content:space-between; align-items:center; padding:11px 14px;
      font-size:14px; border-bottom:1px solid var(--line);}
    .sr-break li:last-child{border-bottom:0;}
    .sr-break li b{color:var(--red); font-family:'Poppins'; font-weight:700;}
    .sr-break__total{background:#FAFAFC;}
    .sr-break__total b{color:var(--ink);}

    /* Cálculo */
    .sr-calc-toggle{background:none; border:0; color:var(--red); font-weight:700; font-size:13.5px;
      cursor:pointer; padding:4px 0; margin-bottom:4px;}
    .sr-calc{background:#FAFAFC; border:1.5px solid var(--line); border-radius:13px; padding:14px 16px; margin-bottom:8px;}
    .sr-calc p{margin:0 0 6px; font-size:13.5px; line-height:1.5;}
    .sr-calc__obs{color:var(--muted); font-size:12px;}

    /* Select cartão atual */
    .sr-select{position:relative; margin-bottom:20px;}
    .sr-select select{-webkit-appearance:none; appearance:none; width:100%; border:1.5px solid var(--line);
      border-radius:13px; padding:13px 40px 13px 14px; font-size:15px; font-family:'Inter'; font-weight:600;
      color:var(--ink); background:#fff; outline:0; cursor:pointer; transition:.15s;}
    .sr-select select:focus{border-color:var(--red); box-shadow:0 0 0 3px rgba(236,0,0,.10);}
    .sr-select:after{content:'▾'; position:absolute; right:16px; top:50%; transform:translateY(-50%);
      color:var(--red); font-size:14px; pointer-events:none;}

    /* Modal de contato */
    .sr-modal{position:fixed; inset:0; background:rgba(15,5,5,.55); backdrop-filter:blur(3px);
      display:flex; align-items:center; justify-content:center; padding:18px; z-index:50; animation:srFade .2s ease;}
    .sr-modal__card{width:100%; max-width:420px; background:#fff; border-radius:20px; padding:26px 22px 22px;
      position:relative; box-shadow:0 20px 60px rgba(0,0,0,.3); animation:srPop .25s cubic-bezier(.2,.9,.3,1.2);}
    .sr-modal__x{position:absolute; top:14px; right:14px; width:32px; height:32px; border-radius:50%; border:0;
      background:#F2F2F5; color:var(--muted); font-size:20px; line-height:1; cursor:pointer;}
    .sr-modal__x:hover{background:#E7E7EC;}
    .sr-modal__title{font-family:'Poppins'; font-weight:800; font-size:22px; margin:0 0 6px;}
    .sr-modal__sub{font-size:14px; color:var(--muted); margin:0 0 18px; line-height:1.45;}
    .sr-modal__card .sr-field{margin-bottom:12px;}
    .sr-modal__card .sr-btn{margin-top:8px;}
    .sr-modal__disc{font-size:11.5px; color:var(--muted); text-align:center; margin:12px 2px 0;}
    @keyframes srFade{from{opacity:0;}to{opacity:1;}}
    @keyframes srPop{from{opacity:0; transform:translateY(12px) scale(.96);}to{opacity:1; transform:none;}}
    `}</style>
  );
}
