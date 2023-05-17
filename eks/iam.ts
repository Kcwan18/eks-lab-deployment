import * as aws from "@pulumi/aws";
import { Role } from "@pulumi/aws/iam";
import * as pulumi from "@pulumi/pulumi";
import config from "../config";

interface Args {}
export default class Iam extends pulumi.ComponentResource {
	public readonly eksMasterRole: Role;
	public readonly serviceEksRole: Role;

	constructor(args: Args, opts?: pulumi.ComponentResourceOptions) {
		super("lab:eks", "iam", args, opts);

		const generalOpt: pulumi.CustomResourceOptions = { parent: this };

		const devAccountNumber = config.aws.accountId;

		this.eksMasterRole = new aws.iam.Role(
			"iam-eks-master-role",
			{
				name: "clusterAdminRole",
				assumeRolePolicy: JSON.stringify({
					Version: "2012-10-17",
					Statement: [
						{
							Action: "sts:AssumeRole",
							Effect: "Allow",
							Sid: "",
							Principal: {
								AWS: `arn:aws:iam::${devAccountNumber}:root`,
							},
						},
					],
				}),
				tags: {
					clusterAccess: "clusterAdminRole-usr",
				},
			},
			{
				...generalOpt,
			}
		);

		const policyEksMasterArns = [
			"arn:aws:iam::aws:policy/AdministratorAccess",
		];

		policyEksMasterArns.forEach((policyArn, i) => {
			new aws.iam.RolePolicyAttachment(
				`eks-master-role-policy`,
				{
					policyArn,
					role: this.eksMasterRole,
				},
				{
					...generalOpt,
				}
			);
		});

		const rolePolicy = pulumi.output(
			aws.iam.getPolicyDocument(
				{
					statements: [
						{
							actions: ["sts:AssumeRole"],
							principals: [
								{
									identifiers: ["eks.amazonaws.com"],
									type: "Service",
								},
							],
						},
					],
				},
				{
					...generalOpt,
				}
			)
		);

		this.serviceEksRole = new aws.iam.Role(
			"iam-eks-service-role",
			{
				name: "degital-cloud-eks-service-role",
				assumeRolePolicy: rolePolicy.apply(
					(rolePolicy) => rolePolicy.json
				),
			},
			{
				...generalOpt,
			}
		);

		const policyArns = [
			"arn:aws:iam::aws:policy/AmazonEKSServicePolicy",
			"arn:aws:iam::aws:policy/AmazonEKSClusterPolicy",
			"arn:aws:iam::aws:policy/AmazonEKSVPCResourceController",
		];
		policyArns.forEach((policyArn, i) => {
			new aws.iam.RolePolicyAttachment(
				`degital-cloud-role-policy-${i}`,
				{
					policyArn,
					role: this.serviceEksRole,
				},
				{
					...generalOpt,
				}
			);
		});
	}
}
