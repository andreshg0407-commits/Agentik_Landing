import { prisma } from "./prisma";

async function main() {
  const orgId = "cmcmaqiac0001xsy52conhw27c";
  const projectId = "cmcmaqig00003xsy5y4w462oc";

  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  const project = await prisma.project.findUnique({ where: { id: projectId } });

  console.log("ORG exists?", !!org, org?.slug);
  console.log("PROJECT exists?", !!project, project?.key, project?.organizationId);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());