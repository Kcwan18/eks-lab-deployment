import * as aws from "@pulumi/aws";
import Vpc from "./eks/vpc";
import Iam from "./eks/iam";
import Eks from "./eks/eks";
import NginxIngress from "./eks/add-on/nginx-ingress";
import config from "./config";

const provider = new aws.Provider("aws-provider-app-dev", {
	accessKey: config.aws.accessKey,
	secretKey: config.aws.secretKey,
	region: config.aws.region,
});

// const vpc = new Vpc({}, { provider });
// const iam = new Iam({}, { provider });

// const eks = new Eks({ iam, vpc }, { provider });

// const nginx = new NginxIngress({}, { provider: eks.eks.provider });
