interface Props {
  organization: { name: string };
  workspace?: { name: string };
}

export default function ContextHeader({ organization, workspace }: Props) {
  return (
    <header>
      <p>Agentik</p>
      <p>
        {organization.name}
        {workspace && <> / {workspace.name}</>}
      </p>
    </header>
  );
}
