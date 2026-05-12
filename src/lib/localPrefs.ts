// PC 固有のローカル設定 (localStorage)
const KEY_USER_LOGIN = 'keikaku-qc:user_login';

export function getLocalUserLogin(): string | null {
  try {
    return localStorage.getItem(KEY_USER_LOGIN);
  } catch {
    return null;
  }
}

export function setLocalUserLogin(login: string | null) {
  try {
    if (login && login.length > 0) {
      localStorage.setItem(KEY_USER_LOGIN, login);
    } else {
      localStorage.removeItem(KEY_USER_LOGIN);
    }
  } catch {
    /* ignore */
  }
}
