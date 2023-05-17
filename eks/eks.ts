import * as aws from "@pulumi/aws";
import { Policy, PolicyAttachment, Role } from "@pulumi/aws/iam";
import * as eks from "@pulumi/eks";
import * as pulumi from "@pulumi/pulumi";
import Iam from "./iam";
import Vpc from "./vpc";
import config from "../config";

interface Args {
	iam: Iam;
	vpc: Vpc;
}

export interface IServiceAccountRole {
	csiRole: pulumi.Output<aws.iam.Role>;
	autoscaleRole?: pulumi.Output<aws.iam.Role>;
}

export default class Eks extends pulumi.ComponentResource {
	public readonly eks: eks.Cluster;
	public readonly nodeGroupApplicationNode: eks.ManagedNodeGroup;
	public readonly nodeGroupRole: aws.iam.Role;

	constructor(args: Args, opts?: pulumi.ComponentResourceOptions) {
		super("dedrive:App-Dev", "eks-cluster", args, opts);

		const generalOpt: pulumi.CustomResourceOptions = { parent: this };

		const awsConfig = new pulumi.Config("aws");
		const aws_profile_app_dev = awsConfig.get("profile");

		const awsAccountId = config.aws.accountId;

		const instanceAssumeRolePolicy = aws.iam.getPolicyDocument(
			{
				statements: [
					{
						actions: ["sts:AssumeRole"],
						principals: [
							{
								type: "Service",
								identifiers: ["ec2.amazonaws.com"],
							},
						],
					},
				],
			},
			{
				...generalOpt,
			}
		);

		this.nodeGroupRole = new aws.iam.Role(
			`eks-node-policy`,
			{
				assumeRolePolicy: instanceAssumeRolePolicy.then(
					(rolePolicy) => rolePolicy.json
				),
			},
			{
				...generalOpt,
			}
		);

		const policyArns = [
			"arn:aws:iam::aws:policy/AmazonS3FullAccess",
			"arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy",
			"arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy",
			"arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly",
			"arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess",
			"arn:aws:iam::aws:policy/AmazonSQSFullAccess",
			"arn:aws:iam::aws:policy/AmazonEC2FullAccess",
			"arn:aws:iam::aws:policy/service-role/AWSLambdaSQSQueueExecutionRole",
			"arn:aws:iam::aws:policy/AWSSystemsManagerForSAPFullAccess",
		];
		policyArns.forEach((policyArn, i) => {
			new aws.iam.RolePolicyAttachment(
				`dedrive-role-policy-${i}`,
				{
					policyArn,
					role: this.nodeGroupRole,
				},
				{
					...generalOpt,
					parent: this.nodeGroupRole,
				}
			);
		});

		const kubeconfigOpts: eks.KubeconfigOptions = {
			profileName: aws_profile_app_dev,
		};
		this.eks = new eks.Cluster(
			"eksCluster",
			{
				name: "eks-lab-deployment",
				providerCredentialOpts: kubeconfigOpts,
				vpcId: args.vpc.vpc.id,
				privateSubnetIds: args.vpc.subnet.private.map(
					(_private) => _private.id
				),
				skipDefaultNodeGroup: true,
				serviceRole: args.iam.serviceEksRole,
				vpcCniOptions: {
					warmIpTarget: 4,
					enablePrefixDelegation: true,
					enablePodEni: true,
					disableTcpEarlyDemux: true,
				},
				instanceRole: this.nodeGroupRole,
				clusterSecurityGroup: args.vpc.eksClusterSecurityGrp,
				endpointPrivateAccess: true,
				endpointPublicAccess: true,
				nodeAssociatePublicIpAddress: false,
				createOidcProvider: true,
				version: "1.24",
				clusterSecurityGroupTags: { ClusterSecurityGroupTag: "true" },
				nodeSecurityGroupTags: { NodeSecurityGroupTag: "true" },
				enabledClusterLogTypes: [
					"api",
					"audit",
					"authenticator",
					"controllerManager",
					"scheduler",
				],
				roleMappings: [
					{
						username: "adian.wong",
						roleArn: `arn:aws:iam::${awsAccountId}:user/adian.wong`,
						groups: ["system:masters"],
					},
					{
						username: "sam.leung",
						roleArn: `arn:aws:iam::${awsAccountId}:user/sam.leung`,
						groups: ["system:masters"],
					},
					{
						username: "kc.wan",
						roleArn: `arn:aws:iam::${awsAccountId}:user/kc.wan`,
						groups: ["system:masters"],
					},
					{
						username: "pulumi:admin-usr",
						roleArn: args.iam.eksMasterRole.arn,
						groups: ["system:masters"],
					},
				],
				userMappings: [
					{
						username: "adian.wong",
						userArn: `arn:aws:iam::${awsAccountId}:user/adian.wong`,
						groups: ["system:masters"],
					},
					{
						username: "sam.leung",
						userArn: `arn:aws:iam::${awsAccountId}:user/sam.leung`,
						groups: ["system:masters"],
					},
					{
						username: "kc.wan",
						userArn: `arn:aws:iam::${awsAccountId}:user/kc.wan`,
						groups: ["system:masters"],
					},
	
				],
			},
			{
				...generalOpt,
			}
		);


		this.nodeGroupApplicationNode = new eks.ManagedNodeGroup(
			"nodeGroup-eks-app-dev-application",
			{
				cluster: this.eks,
				nodeRole: this.nodeGroupRole,
				subnetIds: args.vpc.subnet.private.map(
					(_private) => _private.id
				),
				capacityType: "SPOT",
				instanceTypes: ["t3.large"],
				scalingConfig: {
					desiredSize: 1,
					maxSize: 1,
					minSize: 1,
				},
			},
			{
				...generalOpt,
				dependsOn: this.eks.eksCluster,
			}
		);

	

		// const csiDriver = new EksCsiAddon(
		// 	{ serviceAccountRole: this.serviceAccountRole },
		// 	{
		// 		provider: this.eks.provider,
		// 		dependsOn: this.serviceAccountRole.csiRole,
		// 	}
		// );
		// const autoscaler = new EksAutoscalerAddon(
		// 	{
		// 		serviceAccountRole: this.serviceAccountRole,
		// 		eks: this.eks,
		// 		nodeGroupList: [this.nodeGroupApplicationNode],
		// 		// nodeGroupList: [this.nodeGroup],
		// 	},
		// 	{
		// 		provider: this.eks.provider,
		// 		dependsOn: this.serviceAccountRole.autoscaleRole,
		// 	}
		// );

		// const kubeseal = new KubesealPackage(
		// 	{},
		// 	{ provider: this.eks.provider }
		// );
	}
}
