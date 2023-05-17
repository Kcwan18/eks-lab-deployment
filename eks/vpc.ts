import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

interface Args {
	cidrBlock?: string; // Default is 10.0.0.0/16
	ipv6?: boolean;
	// awsProviderAppDev: aws.Provider;
}

interface ISubnetDivision<T> {
	public: T;
	private: T;
	isolated: T;
}

interface ISubnet extends ISubnetDivision<aws.ec2.Subnet[]> {}



export default class Vpc extends pulumi.ComponentResource {
	public readonly vpc: aws.ec2.Vpc;
	public readonly internetGateway: aws.ec2.InternetGateway;
	public readonly egressOnlyInternetGateway: aws.ec2.EgressOnlyInternetGateway;
	public readonly subnet: ISubnet = { public: [], private: [], isolated: [] };
	public readonly networkAcl: aws.ec2.NetworkAcl;
	public readonly eksClusterSecurityGrp: aws.ec2.SecurityGroup;
	public readonly bastionHostSecurityGrp: aws.ec2.SecurityGroup;
	public readonly natInstanceSecurityGrp: aws.ec2.SecurityGroup;
	public readonly appDevVPCLinkSecurityGrp: aws.ec2.SecurityGroup;


	constructor(args: Args, opts?: pulumi.ComponentResourceOptions) {
		super("lab:eks", "vpc", args, opts);

		const generalOpt: pulumi.CustomResourceOptions = { parent: this };

        const cidrBlock = args.cidrBlock || "172.5.0.0/16";

		// Get all available availability zones, excluding local zone
		const availabilityZones = aws.getAvailabilityZones(
			{
				allAvailabilityZones: true,
				state: "available",
				filters: [
					{
						name: "opt-in-status",
						values: ["opt-in-not-required"],
					},
				],
			},
			{
				...generalOpt,
			},
		);

		this.vpc = new aws.ec2.Vpc(
			"vpc",
			{
				cidrBlock,
				assignGeneratedIpv6CidrBlock: true,
				enableDnsHostnames: true,
				enableClassiclinkDnsSupport: true,
				enableDnsSupport: true,
				tags: {
					Name: "Eks-lab-deployment-vpc",
				},
			},
			{
				...generalOpt,
			},
		);

		/* ========== Security Groups ========== */
		this.eksClusterSecurityGrp = new aws.ec2.SecurityGroup(
			"eks-cluster-security-group",
			{ vpcId: this.vpc.id },
			{
				...generalOpt,
			},
		);

		this.bastionHostSecurityGrp = new aws.ec2.SecurityGroup(
			"bastion-host-security-group",
			{
				vpcId: this.vpc.id,
			},
			{
				...generalOpt,
				
			},
		);

		this.natInstanceSecurityGrp = new aws.ec2.SecurityGroup(
			"nat-Instance-security-group",
			{ vpcId: this.vpc.id },
			{
				...generalOpt,
				
			},
		);

		this.appDevVPCLinkSecurityGrp = new aws.ec2.SecurityGroup(
			"apiGateway-vpcLink-security-Grp",
			{
				vpcId: this.vpc.id,
			},
			{ ...generalOpt },
		);

		/* ========== Network Acl ========== */
		this.networkAcl = new aws.ec2.NetworkAcl(
			"network-acl",
			{
				vpcId: this.vpc.id,
				ingress: [
					{
						action: "allow",
						ruleNo: 100,
						cidrBlock: "0.0.0.0/0",
						protocol: "tcp",
						fromPort: 80,
						toPort: 80,
					},
					{
						action: "allow",
						ruleNo: 110,
						ipv6CidrBlock: "::/0",
						protocol: "tcp",
						fromPort: 80,
						toPort: 80,
					},
					{
						action: "allow",
						ruleNo: 120,
						cidrBlock: "0.0.0.0/0",
						protocol: "tcp",
						fromPort: 443,
						toPort: 443,
					},
					{
						action: "allow",
						ruleNo: 130,
						ipv6CidrBlock: "::/0",
						protocol: "tcp",
						fromPort: 443,
						toPort: 443,
					},
				],
				egress: [
					{
						action: "allow",
						ruleNo: 100,
						cidrBlock: "0.0.0.0/0",
						protocol: "tcp",
						fromPort: 1024,
						toPort: 65535,
					},
					{
						action: "allow",
						ruleNo: 110,
						ipv6CidrBlock: "::/0",
						protocol: "tcp",
						fromPort: 1024,
						toPort: 65535,
					},
				],
			},
			{
				...generalOpt,
				
			},
		);

		/* ========== Internet Gateway ========== */
		this.internetGateway = new aws.ec2.InternetGateway(
			"internet-gateway",
			{
				vpcId: this.vpc.id,
			},
			{
				...generalOpt,
				
			},
		);

		/* ========== Egress Only Internet Gateway ========== */
		this.egressOnlyInternetGateway = new aws.ec2.EgressOnlyInternetGateway(
			"egress-only-internet-gateway",
			{
				vpcId: this.vpc.id,
			},
			{
				...generalOpt,
				
			},
		);

		/* ========== Subnet Distributor ========== */
		// const distributor = new SubnetDistributor(cidrBlock, 3);

		/* ========== Public Subnets ========== */
		const publicIPls = ["172.5.33.0/24", "172.5.97.0/24", "172.5.161.0/24"];
		this.subnet.public = publicIPls.map(
			(cidrBlock, i) =>
				new aws.ec2.Subnet(
					`public-subnet-app-dev-${i}`,
					{
						vpcId: this.vpc.id,
						cidrBlock,
						mapPublicIpOnLaunch: true,
						availabilityZone: availabilityZones.then((az) => az.names[i]),
						ipv6CidrBlock: this.vpc.ipv6CidrBlock.apply((cidr) => `${cidr.split("00::/56")[0]}a${i}::/64`),
						assignIpv6AddressOnCreation: true,
						tags: {
							"kubernetes.io/role/elb": "1",
							Name: `dedrive-Public-App-Dev-${i}`,
						},
					},
					{
						...generalOpt,
						
					},
				),
		);

		/* ========== Private Subnets ========== */
		const ls = ["172.5.208.0/20", "172.5.224.0/20", "172.5.240.0/20"];
		this.subnet.private = ls.map(
			(x, i) =>
				new aws.ec2.Subnet(
					`private-subnet-app-dev-${i}`,
					{
						vpcId: this.vpc.id,
						cidrBlock: x,
						availabilityZone: availabilityZones.then((az) => az.names[i]),
						ipv6CidrBlock: this.vpc.ipv6CidrBlock.apply((cidr) => `${cidr.split("00::/56")[0]}b${i}::/64`),
						assignIpv6AddressOnCreation: true,
						tags: {
							"kubernetes.io/role/internal-elb": "1",
							Name: `dedrive-Private-App-Dev-${i}`,
						},
					},
					{
						...generalOpt,
						
					},
				),
		);

		/* ========== Isolated Subnets ========== */
		const isolatedIPls = ["172.5.0.0/21", "172.5.64.0/21", "172.5.128.0/21"];
		this.subnet.isolated = isolatedIPls.map(
			(cidrBlock, i) =>
				new aws.ec2.Subnet(
					`isolated-subnet-app-dev-${i}`,
					{
						vpcId: this.vpc.id,
						cidrBlock,
						availabilityZone: availabilityZones.then((az) => az.names[i]),
						ipv6CidrBlock: this.vpc.ipv6CidrBlock.apply((cidr) => `${cidr.split("00::/56")[0]}c${i}::/64`),
						tags: {
							Name: `dedrive-Isolated-App-dev-${i}`,
						},
					},
					{
						...generalOpt,
						
					},
				),
		);
	}
}
