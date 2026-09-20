import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import {
  listConnections, saveConnection, encryptionConfigured,
  PROVIDER_SPEC, PROVIDERS,
  type ConnectionKind, type ConnectionSecret, type Provider,
} from "@/lib/connections";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  return NextResponse.json({
    connections: await listConnections(),
    encryptionConfigured: encryptionConfigured(),
    providers: PROVIDERS.map((p) => ({ id: p, ...PROVIDER_SPEC[p] })),
  });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  if (!encryptionConfigured()) {
    return NextResponse.json(
      { error: "SETTINGS_ENCRYPTION_KEY is not set, so secrets cannot be stored. Generate one with: openssl rand -base64 32" },
      { status: 503 },
    );
  }

  const body = (await request.json()) as {
    provider?: Provider; kind?: ConnectionKind; label?: string;
    url?: string; apiKey?: string; token?: string; credentialsJson?: string;
  };

  const { provider, kind } = body;
  if (!provider || !PROVIDERS.includes(provider)) {
    return NextResponse.json({ error: `provider must be one of ${PROVIDERS.join(", ")}` }, { status: 400 });
  }
  if (!kind || !PROVIDER_SPEC[provider].kinds.includes(kind)) {
    return NextResponse.json(
      { error: `${provider} supports: ${PROVIDER_SPEC[provider].kinds.join(", ")}` },
      { status: 400 },
    );
  }

  let secret: ConnectionSecret;
  if (kind === "api") {
    if (!body.apiKey?.trim()) return NextResponse.json({ error: "An API key is required" }, { status: 400 });
    secret = { apiKey: body.apiKey.trim() };
  } else if (kind === "mcp") {
    if (!body.url?.trim()) return NextResponse.json({ error: "An endpoint URL is required" }, { status: 400 });
    if (!/^https?:\/\//i.test(body.url.trim())) {
      return NextResponse.json({ error: "The endpoint URL must be http(s)" }, { status: 400 });
    }
    secret = { token: (body.token ?? "").trim() };
  } else {
    if (!body.credentialsJson?.trim()) {
      return NextResponse.json({ error: "Paste the credentials file contents" }, { status: 400 });
    }
    secret = { credentialsJson: body.credentialsJson.trim() };
  }

  try {
    const connection = await saveConnection({
      provider, kind,
      label: body.label ?? "",
      config: body.url ? { url: body.url.trim() } : {},
      secret,
      userId: user.id,
    });
    return NextResponse.json({ connection });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
