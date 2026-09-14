import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refresca la sesión (de administrador o de cliente) en cada petición a
// las páginas que la necesitan, tal y como recomienda Supabase para
// Next.js App Router — sin esto, la sesión podría caducar de golpe en
// vez de renovarse sola en segundo plano.
// (En Next.js 16 este archivo se llama proxy.ts en vez de middleware.ts)
export async function proxy(request: NextRequest) {
  // Deja la ruta que se pidió en una cabecera, para que las páginas de
  // servidor (requireCliente, requireAdmin) puedan leerla con headers()
  // y, si mandan a la pantalla de acceso, sepan a dónde volver después
  // de iniciar sesión en vez de mandar siempre a la home / al dashboard.
  request.headers.set("x-pathname", request.nextUrl.pathname + request.nextUrl.search);

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/", "/reservar", "/perfil", "/acceso"],
};
