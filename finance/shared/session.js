/**
 * Shared portal session guard for the Gahonsh Finance portals.
 *
 * Every portal page (admin, agent, customer) must prove the visitor holds a
 * live session before it renders protected content. This module is the single
 * implementation of that check, so the rule cannot drift between pages.
 *
 * `GFPortal.require(portal)` calls `GET /api/auth/me` with the stored bearer
 * token. A missing, expired or forged token — and a token whose role is not
 * allowed on that portal — is never trusted: the browser is sent to the right
 * sign-in page (or, for a valid session on the wrong portal, to the portal its
 * role owns). Only a server-verified role is used; the `userRole` value in
 * `localStorage` is display-only and never authorises anything.
 *
 * This is a classic script (not an ES module) because the portal pages load
 * their scripts as classic scripts. It must load before any page guard.
 */
(function (global) {
  'use strict';

  var TOKEN_KEY = 'token';
  var ROLE_KEY = 'userRole';

  // Roles allowed per portal. The server stays the authority on every API call;
  // these lists only decide which portal shell a role may see.
  var PORTAL_ROLES = {
    admin: ['SUPER_ADMIN', 'CLIENT_ADMIN', 'BRANCH_ADMIN', 'MANAGER'],
    agent: ['SUPER_ADMIN', 'CLIENT_ADMIN', 'BRANCH_ADMIN', 'MANAGER', 'AGENT'],
    customer: ['CUSTOMER'],
  };

  // Where an unauthenticated visitor is sent for each portal.
  var SIGN_IN_URL = {
    admin: '/finance/admin/',
    agent: '/finance/site/signin.html',
    customer: '/finance/site/signin.html',
  };

  // The portal a role owns, so a signed-in user who lands on the wrong portal
  // is forwarded instead of shown a login form they cannot use.
  var ROLE_HOME = {
    SUPER_ADMIN: '/finance/admin/',
    CLIENT_ADMIN: '/finance/admin/',
    BRANCH_ADMIN: '/finance/admin/',
    MANAGER: '/finance/admin/',
    AGENT: '/finance/agent/',
    CUSTOMER: '/finance/customer/',
  };

  function token() {
    try {
      return global.localStorage.getItem(TOKEN_KEY) || '';
    } catch (e) {
      return '';
    }
  }

  function saveRole(role) {
    try {
      global.localStorage.setItem(ROLE_KEY, role || '');
    } catch (e) { /* storage unavailable */ }
  }

  function saveToken(value) {
    try {
      global.localStorage.setItem(TOKEN_KEY, value || '');
    } catch (e) { /* storage unavailable */ }
  }

  function clear() {
    try {
      global.localStorage.removeItem(TOKEN_KEY);
      global.localStorage.removeItem(ROLE_KEY);
    } catch (e) { /* storage unavailable */ }
  }

  function roles(portal) {
    return (PORTAL_ROLES[portal] || []).slice();
  }

  function home(role) {
    return ROLE_HOME[role] || '/finance/site/signin.html';
  }

  /** Verifies the stored token against the server; resolves null when invalid. */
  async function verify() {
    var current = token();
    if (!current) return null;
    try {
      var res = await fetch('/api/auth/me', {
        headers: { 'Authorization': 'Bearer ' + current },
      });
      if (!res.ok) return null;
      var data = await res.json();
      if (!data || !data.user || !data.user.role) return null;
      return { token: current, user: data.user };
    } catch (e) {
      return null;
    }
  }

  /**
   * Resolves the session when it is valid for `portal`. Otherwise it redirects
   * (to sign-in when there is no session, to the role's own portal when the
   * session is valid but not permitted here) and resolves null.
   */
  async function require(portal) {
    var session = await verify();
    if (!session) {
      clear();
      global.location.replace(SIGN_IN_URL[portal] || '/finance/site/signin.html');
      return null;
    }
    if (roles(portal).indexOf(session.user.role) === -1) {
      global.location.replace(home(session.user.role));
      return null;
    }
    saveRole(session.user.role);
    return session;
  }

  function signOut(portal) {
    clear();
    global.location.replace(SIGN_IN_URL[portal] || '/finance/site/signin.html');
  }

  global.GFPortal = {
    token: token,
    saveToken: saveToken,
    verify: verify,
    require: require,
    signOut: signOut,
    clear: clear,
    saveRole: saveRole,
    roles: roles,
    home: home,
  };
})(window);
