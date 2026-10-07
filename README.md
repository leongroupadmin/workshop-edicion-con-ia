# Remotion video

<p align="center">
  <a href="https://github.com/remotion-dev/logo">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://github.com/remotion-dev/logo/raw/main/animated-logo-banner-dark.apng">
      <img alt="Animated Remotion Logo" src="https://github.com/remotion-dev/logo/raw/main/animated-logo-banner-light.gif">
    </picture>
  </a>
</p>

Welcome to your Remotion project!

## Commands

**Install Dependencies**

```console
npm i --loglevel=error
```

**Start Preview**

```console
npm run dev
```

**Render video**

```console
npx remotion render
```

**Upgrade Remotion**

```console
npx remotion upgrade
```

## Proveedor de IA del panel

Claude (Anthropic) sigue siendo el proveedor predeterminado. En cada proyecto,
el selector **IA** permite usar OpenAI para el plan y el chat sin alterar la
sesión ni las credenciales de Claude. OpenAI usa la cuenta de ChatGPT ya
iniciada en Codex CLI, por lo que no hace falta una API key. Verificá o iniciá
esa sesión con:

```console
codex login status
codex login
```

Por defecto, el panel usa `gpt-5.6-terra` para OpenAI. Opcionalmente,
`OPENAI_MODEL` en `app/.env.local` permite elegir otro modelo para Codex.

La generación local de escenas para HyperFrames continúa usando Claude, porque
es el agente que tiene integrado el entorno y las skills de render del proyecto.

## Docs

Get started with Remotion by reading the [fundamentals page](https://www.remotion.dev/docs/the-fundamentals).

## Help

We provide help on our [Discord server](https://discord.gg/6VzzNDwUwV).

## Issues

Found an issue with Remotion? [File an issue here](https://github.com/remotion-dev/remotion/issues/new).

## License

Note that for some entities a company license is needed. [Read the terms here](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md).
