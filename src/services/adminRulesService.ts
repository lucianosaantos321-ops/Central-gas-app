import type { AdminRuleState } from "../types";

const STORAGE_KEY = "cg_admin_rules_v1";

function now() {
  return new Date().toISOString();
}

function defaultRules(): AdminRuleState {
  return {
    comissaoPorEntrega: 10,
    limiteBloqueioSaldo: 300,
    updatedAt: now(),
  };
}

function safeRead(): AdminRuleState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultRules();

    const parsed = JSON.parse(raw);
    return {
      comissaoPorEntrega: Number(parsed?.comissaoPorEntrega ?? 10),
      limiteBloqueioSaldo: Number(parsed?.limiteBloqueioSaldo ?? 300),
      updatedAt: String(parsed?.updatedAt || now()),
    };
  } catch {
    return defaultRules();
  }
}

function safeWrite(value: AdminRuleState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // ignore
  }
}

export const adminRulesService = {
  getRules(): AdminRuleState {
    const rules = safeRead();

    if (!Number.isFinite(rules.comissaoPorEntrega) || rules.comissaoPorEntrega < 0) {
      rules.comissaoPorEntrega = 10;
    }

    if (!Number.isFinite(rules.limiteBloqueioSaldo) || rules.limiteBloqueioSaldo <= 0) {
      rules.limiteBloqueioSaldo = 300;
    }

    return rules;
  },

  updateRules(input: Partial<AdminRuleState>) {
    const current = this.getRules();

    const next: AdminRuleState = {
      ...current,
      ...input,
      comissaoPorEntrega: Number(
        input.comissaoPorEntrega ?? current.comissaoPorEntrega
      ),
      limiteBloqueioSaldo: Number(
        input.limiteBloqueioSaldo ?? current.limiteBloqueioSaldo
      ),
      updatedAt: now(),
    };

    if (!Number.isFinite(next.comissaoPorEntrega) || next.comissaoPorEntrega < 0) {
      next.comissaoPorEntrega = current.comissaoPorEntrega;
    }

    if (!Number.isFinite(next.limiteBloqueioSaldo) || next.limiteBloqueioSaldo <= 0) {
      next.limiteBloqueioSaldo = current.limiteBloqueioSaldo;
    }

    safeWrite(next);
    return next;
  },
};