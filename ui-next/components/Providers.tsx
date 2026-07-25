"use client";

import { admin, auth, QueryClientProvider } from "@ericbutera/kaleido";
import {
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { Toaster } from "react-hot-toast";
import type { AppConfig } from "../lib/config";
import { ConfigProvider } from "../lib/config-context";
import { authApiClient, queryClient } from "../lib/kaleido";
import AdminNav from "./admin/Nav";
import Navigation from "./Navigation";

admin.configureAdminLayout({
  SiteNavigation: Navigation,
  AdminNav,
});

export default function Providers({
  config,
  children,
}: {
  config: AppConfig;
  children: ReactNode;
}) {
  const authExports = auth as typeof auth & {
    getSsoProviderOptions?: (providers: string) => OAuthProviderOption[];
    createOAuthProviderButtons?: (
      apiUrl: string,
    ) => ComponentType<{
      providers: OAuthProviderOption[];
      text?: string;
      unavailable?: ReactNode;
    }>;
  };
  const ssoProviders = (
    authExports.getSsoProviderOptions ?? getSsoProviderOptions
  )(config.SSO_PROVIDERS);
  const OAuthProviderButtons =
    authExports.createOAuthProviderButtons?.(config.API_URL) ??
    createOAuthProviderButtons(config.API_URL);

  const authConfig = {
    passwordAuthEnabled: config.AUTH_PASSWORD_ENABLED,
    registrationEnabled: config.AUTH_REGISTRATION_ENABLED,
    oauthProviders: ssoProviders,
    OAuthProviderButtons,
    oauthEnabled: true,
    OAuthButton: createLegacyOAuthButton(config.API_URL, ssoProviders),
  };

  return (
    <ConfigProvider initialConfig={config}>
      <QueryClientProvider client={queryClient}>
        <auth.AuthProvider client={authApiClient} config={authConfig as any}>
          {children}
          <Toaster position="top-right" />
        </auth.AuthProvider>
      </QueryClientProvider>
    </ConfigProvider>
  );
}

type OAuthProviderOption = {
  id: string;
  label: string;
};

type ProvidersResponse = {
  providers?: OAuthProviderOption[];
};

const PROVIDER_LABELS: Record<string, string> = {
  authentik: "Continue with Authentik",
  dev: "Continue as local developer",
  google: "Continue with Google",
};

function getSsoProviderOptions(rawProviders: string): OAuthProviderOption[] {
  const seen = new Set<string>();

  return rawProviders
    .split(",")
    .map((provider) => provider.trim().toLowerCase())
    .filter(Boolean)
    .filter((provider) => {
      if (seen.has(provider)) {
        return false;
      }
      seen.add(provider);
      return true;
    })
    .map((provider) => ({
      id: provider,
      label: PROVIDER_LABELS[provider] ?? `Continue with ${provider}`,
    }));
}

function buttonClassName(provider: string): string {
  if (provider === "authentik") {
    return "btn btn-primary w-full";
  }

  if (provider === "dev") {
    return "btn btn-secondary w-full";
  }

  return "btn btn-outline w-full";
}

function createOAuthProviderButtons(apiUrl: string) {
  const baseUrl = apiUrl.replace(/\/$/, "");

  return function OAuthProviderButtons({
    providers,
    text,
    unavailable = null,
  }: {
    providers: OAuthProviderOption[];
    text?: string;
    unavailable?: ReactNode;
  }) {
    const visibleProviders = useDiscoveredProviders(
      providers,
      `${baseUrl}/oauth/providers`,
    );

    if (!visibleProviders) {
      return null;
    }

    if (visibleProviders.length === 0) {
      return <>{unavailable}</>;
    }

    return (
      <div className="flex w-full flex-col gap-3">
        {visibleProviders.map((provider) => (
          <button
            key={provider.id}
            type="button"
            className={buttonClassName(provider.id)}
            onClick={() => {
              window.location.assign(`${baseUrl}/oauth/${provider.id}`);
            }}
          >
            {visibleProviders.length === 1 && text ? text : provider.label}
          </button>
        ))}
      </div>
    );
  };
}

function createLegacyOAuthButton(
  apiUrl: string,
  providers: OAuthProviderOption[],
) {
  const OAuthProviderButtons = createOAuthProviderButtons(apiUrl);

  return function OAuthButton({ text }: { text: string }) {
    return <OAuthProviderButtons providers={providers} text={text} />;
  };
}

function useDiscoveredProviders(
  providers: OAuthProviderOption[],
  providersUrl: string,
): OAuthProviderOption[] | null {
  const [discoveredProviders, setDiscoveredProviders] = useState<
    OAuthProviderOption[] | null
  >(null);

  useEffect(() => {
    if (providers.length > 0) {
      return;
    }

    let active = true;

    fetch(providersUrl, {
      credentials: "include",
      headers: { Accept: "application/json" },
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`OAuth provider discovery failed: ${response.status}`);
        }
        return response.json() as Promise<ProvidersResponse>;
      })
      .then((body) => {
        if (active) {
          setDiscoveredProviders(normalizeProviders(body.providers ?? []));
        }
      })
      .catch(() => {
        if (active) {
          setDiscoveredProviders([]);
        }
      });

    return () => {
      active = false;
    };
  }, [providers.length, providersUrl]);

  return useMemo(
    () =>
      providers.length > 0 ? normalizeProviders(providers) : discoveredProviders,
    [discoveredProviders, providers],
  );
}

function normalizeProviders(
  providers: OAuthProviderOption[],
): OAuthProviderOption[] {
  const seen = new Set<string>();

  return providers
    .map((provider) => ({
      id: provider.id.trim().toLowerCase(),
      label: provider.label?.trim() || `Continue with ${provider.id}`,
    }))
    .filter((provider) => provider.id.length > 0)
    .filter((provider) => {
      if (seen.has(provider.id)) {
        return false;
      }
      seen.add(provider.id);
      return true;
    });
}
