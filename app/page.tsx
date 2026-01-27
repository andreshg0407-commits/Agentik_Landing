import { Card, CardContent } from "@/components/ui/card"
import { BentoGrid, BentoCard } from "@/components/ui/bento-grid"
import { Navbar } from "@/components/ui/navbar"
import {
  CheckCircle,
  ArrowRight,
  TrendingUp,
  Clock,
  BarChart3,
  Bot,
  Workflow,
  MessageSquare,
  Cog,
} from "lucide-react"

export default function HomePage() {
  return (
    <div className="min-h-screen bg-[#f7f8fa]">
      {/* Navigation Component */}
      <Navbar />

      {/* HERO */}
<section className="bg-[#f7f8fa] min-h-[85vh]">
  <div className="mx-auto max-w-7xl px-6 pt-28 pb-24 md:pt-32 md:pb-28 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
    {/* COLUMNA IZQUIERDA — TEXTO */}
    <div className="relative z-10">
      <p className="text-gray-600 text-sm uppercase tracking-wide">
        Agentik • Empleados virtuales con IA
      </p>

      <h1 className="text-3xl md:text-5xl font-semibold leading-[1.15] tracking-tight">
        Empleados con IA que hacen tareas reales por ti.
      </h1>

      <p className="mt-6 text-base md:text-lg text-gray-600 max-w-xl">
  Agentik es para negocios, profesionales o personas.
  Vende por WhatsApp, publica contenido, gestiona inventario, agenda reservas...
</p>

      <div className="mt-6 flex flex-wrap gap-2 text-sm text-gray-700">
        <span className="rounded-full bg-black/5 px-3 py-1">Ventas por WhatsApp</span>
        <span className="rounded-full bg-black/5 px-3 py-1">Shopify</span>
        <span className="rounded-full bg-black/5 px-3 py-1">Redes</span>
        <span className="rounded-full bg-black/5 px-3 py-1">Reservas</span>
        <span className="rounded-full bg-black/5 px-3 py-1">Automatización</span>
      </div>

      {/* BOTONES */}
      <div className="mt-10 flex flex-col sm:flex-row gap-4">
        <a
          href="/agentes/marketing"
          className="rounded-xl bg-black px-6 py-3 font-semibold text-white hover:bg-black/90 transition"
        >
          Conocer los agentes
        </a>

        <a
          href="#como-funciona"
          className="rounded-xl border border-black/20 px-6 py-3 font-semibold text-black hover:bg-black/5 transition"
        >
          Ver cómo funciona
        </a>
      </div>

      <div className="mt-8 text-gray-500 text-sm">
        <span className="font-mono bg-black/5 px-2 py-1 rounded">
          Empieza con un agente. Agrega más cuando lo necesites.
        </span>
      </div>

      <div className="mt-4 text-gray-600 text-sm">
        ¿Necesitas una autorización o flujo personalizado?{" "}
        <a
          href="mailto:hello@agentik.ai"
          className="underline underline-offset-4 hover:text-gray-900"
        >
          Escríbenos
        </a>
        .
      </div>
    </div>

    {/* COLUMNA DERECHA — ROBOT */}
    <div className="relative flex items-center justify-center lg:justify-end -translate-y-4">
      <div className="w-full max-w-[540px] h-[420px] md:h-[520px] lg:h-[620px]">
        <iframe
          src="https://my.spline.design/nexbotrobotcharacterconcept-kAZefxQm4X8uFGbZ0NfCTefi/"
          width="100%"
          height="100%"
          frameBorder="0"
          style={{ border: "none" }}
          allowFullScreen
        />
      </div>
    </div>
  </div>
</section>

      {/* ECOSISTEMA: Agentik no es solo Luca */}
      <section id="services" className="py-24 bg-black">
        <div className="container mx-auto px-4">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-white">
              Agentik es tu equipo de empleados virtuales
            </h2>
            <p className="text-xl text-gray-300 max-w-2xl mx-auto">
              Empieza con Luca (Ventas) y luego agregas otros agentes por rol: operaciones, Marketing,
              inventario, reservas, reportes.
            </p>
          </div>

          <BentoGrid className="lg:grid-rows-3">
            <BentoCard
              name="Social Media Manager"
              className="lg:row-start-1 lg:row-end-4 lg:col-start-2 lg:col-end-3"
              background={
                <div className="absolute inset-0 bg-black/80 backdrop-blur-sm border border-white/10" />
              }
              Icon={Bot}
              description="Crea copy, guiones, hashtags y ideas. Tú das la orden por web o Telegram. Luca ejecuta."
              href="/agentes/marketing"
              cta="Probar a Luca"
            />

            <BentoCard
              name="Ops — Inventario & Reportes"
              className="lg:col-start-1 lg:col-end-2 lg:row-start-1 lg:row-end-3"
              background={
                <div className="absolute inset-0 bg-black/80 backdrop-blur-sm border border-white/10" />
              }
              Icon={BarChart3}
              description="Ventas del día, producto top, stock por agotarse, alertas y reportes simples."
              href="#contact"
              cta="Quiero esto"
            />

            <BentoCard
              name="Commerce — Shopify / Catálogo"
              className="lg:col-start-1 lg:col-end-2 lg:row-start-3 lg:row-end-4"
              background={
                <div className="absolute inset-0 bg-black/80 backdrop-blur-sm border border-white/10" />
              }
              Icon={Cog}
              description="Subir producto, cambiar precio, actualizar inventario, crear colecciones y descripciones."
              href="#contact"
              cta="Automatizar mi Shopify"
            />

            <BentoCard
              name="Sales — WhatsApp / Leads"
              className="lg:col-start-3 lg:col-end-3 lg:row-start-1 lg:row-end-2"
              background={
                <div className="absolute inset-0 bg-black/80 backdrop-blur-sm border border-white/10" />
              }
              Icon={MessageSquare}
              description="Responde, clasifica (mayorista/detalle) y empuja a cierre con tu estilo de venta."
              href="#contact"
              cta="Necesito ventas"
            />

            <BentoCard
              name="Bookings — Citas / Reservas"
              className="lg:col-start-3 lg:col-end-3 lg:row-start-2 lg:row-end-4"
              background={
                <div className="absolute inset-0 bg-black/80 backdrop-blur-sm border border-white/10" />
              }
              Icon={Workflow}
              description="Agenda citas, confirma, reprograma y manda recordatorios (ideal para hoteles, rentas cortas, servicios)."
              href="#contact"
              cta="Quiero reservas"
            />
          </BentoGrid>
        </div>
      </section>

      {/* CASOS DE USO REALES */}
      <section className="py-24 bg-white border-t border-black/5">
        <div className="container mx-auto px-4">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
              ¿Cómo se usa Agentik en la vida real?
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Algunos ejemplos de empleados virtuales que ya estamos construyendo para negocios reales.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                title: "Marca de ropa / Ecommerce",
                text: "Luca crea contenido diario. Otro agente sube productos, actualiza inventario y avisa qué se está vendiendo más.",
              },
              {
                title: "Hotel o rentas cortas",
                text: "Un agente responde mensajes, gestiona reservas, confirma fechas y envía recordatorios automáticos.",
              },
              {
                title: "Negocio local / Servicios",
                text: "Un agente agenda citas, responde WhatsApp y otro publica contenido semanal en redes.",
              },
              {
                title: "Empresa con varios negocios",
                text: "Cada negocio tiene su empleado virtual: marketing, ventas, reportes y control diario desde Telegram.",
              },
              {
                title: "Mayoristas / Ventas B2B",
                text: "Agente que clasifica clientes, envía catálogos y deriva pedidos grandes a humano.",
              },
              {
                title: "Emprendedor solo",
                text: "Agentik actúa como su primer equipo: contenido, respuestas y organización sin contratar personal.",
              },
            ].map((c) => (
              <Card key={c.title} className="border-black/10">
                <CardContent className="p-6">
                  <h3 className="font-semibold text-gray-900">{c.title}</h3>
                  <p className="mt-2 text-gray-600 text-sm">{c.text}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Problem & Solution Section */}
      <section className="py-24 bg-black">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-16 items-start">
            <div className="space-y-6">
              <h2 className="text-3xl md:text-4xl font-bold text-white">
                ¿Tu negocio depende demasiado de ti?
              </h2>
              <div className="space-y-4 text-gray-300">
                {[
                  "Tareas repetitivas te consumen el día (contenido, inventario, reportes).",
                  "No hay consistencia en redes y eso frena ventas.",
                  "Quieres crecer, pero contratar más gente cuesta y toma tiempo.",
                  "Te falta control en varios negocios a la vez.",
                ].map((t) => (
                  <p key={t} className="flex items-start gap-3">
                    <span className="text-red-500 mt-1">✗</span>
                    {t}
                  </p>
                ))}
              </div>
            </div>

            <div className="space-y-6">
              <h3 className="text-2xl font-bold text-white">
                Agentik crea empleados virtuales por rol
              </h3>
              <div className="space-y-4 text-gray-300">
                {[
                  "Un agente para marketing (Luca) y otros para operaciones, ventas y reservas.",
                  "Automatizaciones: lo repetitivo se vuelve automático.",
                  "Integración con tus herramientas: Shopify, WhatsApp, Google Calendar, etc.",
                  "Escala por módulos: agregas empleados cuando el negocio lo pide.",
                ].map((t) => (
                  <p key={t} className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                    {t}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* BENEFITS SECTION */}
      <section className="py-24 bg-[#f7f8fa] border-t border-black/5">
        <div className="container mx-auto px-4">
          <div className="text-center space-y-4 mb-16">
            <p className="text-sm text-gray-500">
              Ideal para dueños que quieren crecimiento sin contratar más personal cada vez.
            </p>

            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
              Beneficios que se sienten en el negocio
            </h2>

            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Agentik no es “otra herramienta”. Es un equipo de empleados virtuales que te devuelve tiempo y control.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                icon: <Clock className="h-6 w-6 text-green-600" />,
                title: "Ahorro de tiempo real",
                text: "Lo repetitivo se delega. Tú te enfocas en decisiones y ventas.",
              },
              {
                icon: <TrendingUp className="h-6 w-6 text-blue-600" />,
                title: "Consistencia que vende",
                text: "Contenido y acciones con un sistema, no con inspiración.",
              },
              {
                icon: <MessageSquare className="h-6 w-6 text-purple-600" />,
                title: "Más conversaciones",
                text: "Copy diseñado para mensajes, leads o compras, según tu objetivo.",
              },
              {
                icon: <BarChart3 className="h-6 w-6 text-orange-600" />,
                title: "Control y visibilidad",
                text: "Reportes simples: qué se mueve, qué falta, qué hacer hoy.",
              },
              {
                icon: <Workflow className="h-6 w-6 text-slate-700" />,
                title: "Automatización progresiva",
                text: "Empiezas asistido. Luego automatizas con flujos e integraciones.",
              },
              {
                icon: <Bot className="h-6 w-6 text-black" />,
                title: "Escalas por roles",
                text: "Agregas empleados virtuales por tarea: marketing, ops, ventas, reservas.",
              },
            ].map((b) => (
              <Card key={b.title} className="bg-white border-black/10">
                <CardContent className="p-6">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-black/5 flex items-center justify-center">
                      {b.icon}
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900">{b.title}</h3>
                  </div>
                  <p className="mt-3 text-gray-600 text-sm leading-relaxed">{b.text}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* PROCESS SECTION */}
      <section className="py-24 bg-black" id="como-funciona">
        <div className="container mx-auto px-4">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-white">
              Cómo funciona Agentik
            </h2>
            <p className="text-xl text-gray-300 max-w-2xl mx-auto">
              Crear empleados virtuales para tu negocio es más simple de lo que imaginas.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center space-y-6">
              <div className="h-20 w-20 bg-white text-black rounded-full flex items-center justify-center mx-auto text-2xl font-bold">
                1
              </div>
              <h3 className="text-xl font-bold text-white">Elige el rol</h3>
              <p className="text-gray-300">
                Selecciona el empleado virtual que más te ayude hoy: marketing (Luca), ventas, Shopify, reservas o reportes.
              </p>
            </div>

            <div className="text-center space-y-6">
              <div className="h-20 w-20 bg-white text-black rounded-full flex items-center justify-center mx-auto text-2xl font-bold">
                2
              </div>
              <h3 className="text-xl font-bold text-white">Dale instrucciones</h3>
              <p className="text-gray-300">
                Hablas con Agentik por web o Telegram como lo harías con un empleado: qué hacer, cuándo y con qué objetivo.
              </p>
            </div>

            <div className="text-center space-y-6">
              <div className="h-20 w-20 bg-white text-black rounded-full flex items-center justify-center mx-auto text-2xl font-bold">
                3
              </div>
              <h3 className="text-xl font-bold text-white">Agentik ejecuta</h3>
              <p className="text-gray-300">
                El agente crea, publica, responde o reporta. Tú apruebas cuando quieras y agregas más empleados al crecer.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="py-24 bg-black border-t border-white/10">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white">
            Crea tu primer empleado virtual
          </h2>

          <p className="mt-4 text-gray-300 max-w-2xl mx-auto">
            Empieza con el rol que más te ahorre tiempo hoy (marketing, Shopify, reservas o ventas).
            Agentik ejecuta tareas reales por ti desde el primer día.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="/agentes/marketing"
              className="inline-flex items-center justify-center rounded-xl bg-white px-7 py-3 font-semibold text-black hover:bg-gray-100 transition"
            >
              Crear mi primer empleado
              <ArrowRight className="ml-2 h-4 w-4" />
            </a>

            <a
              href="#pricing"
              className="inline-flex items-center justify-center rounded-xl border border-white/30 px-7 py-3 font-semibold text-white hover:bg-white/10 transition"
            >
              Ver planes
            </a>
          </div>

          <div className="mt-8 text-sm text-gray-400">
            Ejemplo:{" "}
            <span className="font-mono bg-white/5 px-2 py-1 rounded">
              “Agentik, publica 3 posts esta semana y avísame cuál tuvo más resultados”
            </span>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-black border-t border-white/10 py-16">
        <div className="container mx-auto px-6">
          <div className="grid md:grid-cols-4 gap-12">
            <div className="space-y-4 md:col-span-1">
              <h3 className="text-xl font-bold text-white">Agentik</h3>
              <p className="text-sm text-gray-400 leading-relaxed">
                Empleados virtuales impulsados por IA que ejecutan tareas reales para negocios modernos.
              </p>
              <p className="text-xs text-gray-500">Tú hablas. Ellos trabajan.</p>
            </div>

            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-white uppercase tracking-wide">Producto</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><a href="/agentes/marketing" className="hover:text-white transition">Luca · Marketing</a></li>
                <li><a href="#pricing" className="hover:text-white transition">Planes</a></li>
                <li><a href="#como-funciona" className="hover:text-white transition">Cómo funciona</a></li>
              </ul>
            </div>

            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-white uppercase tracking-wide">Empleados virtuales</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li>Marketing & redes</li>
                <li>Shopify & ecommerce</li>
                <li>Reservas & citas</li>
                <li>Ventas & atención</li>
              </ul>
            </div>

            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-white uppercase tracking-wide">Empresa</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><a href="/privacy" className="hover:text-white transition">Política de privacidad</a></li>
                <li><a href="/terms" className="hover:text-white transition">Términos del servicio</a></li>
                <li><a href="mailto:hello@agentik.ai" className="hover:text-white transition">hello@agentik.ai</a></li>
              </ul>
            </div>
          </div>

          <div className="mt-12 pt-8 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-xs text-gray-500">
              © {new Date().getFullYear()} Agentik. Todos los derechos reservados.
            </p>
            <p className="text-xs text-gray-500">
              Construido para dueños de negocio, no para técnicos.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}